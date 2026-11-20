# 参数化安装底板 · 用 MCP 把自然语言变成可编辑的三维模型

第一届 MCP 智造杯 AI 三维创客大赛 初赛作品　｜　赛道：FreeCAD

对 AI 说一句「做一块 120×60×10、四角 M4 通孔、R3 圆角的底板」，模型通过 MCP 协议驱动 FreeCAD
完成参数化建模，在无界面模式下导出 STL / STEP / 可编辑的 FCStd，全过程留痕、可复现、可验证。

## 目录

```
初赛作品/
├── 01_作品说明/      作品说明.md（PDF 的源文件）+ 作品说明.pdf
├── 02_MCP调用记录/   原始 JSON-RPC 帧（jsonl）、会话摘要、可读版记录
├── 03_可复现配置/    launcher、构建脚本、参数表、MCP 配置、复现说明
├── 04_模型源文件/    bracket.FCStd / .step / .stl + build_report.json
├── 05_演示视频/      6 分 03 秒连续操作录像 + 分镜脚本
└── _source/          文档的 Markdown 源与中间 HTML（用于重新生成 PDF）
```

## 技术栈

| 层 | 组件 |
| --- | --- |
| 交互层 | Cherry Studio 2.2.2（对话式入口，管理 MCP 服务器） |
| 模型层 | DeepSeek-V4.1-Flash（意图理解、参数抽取、工具选择） |
| 协议层 | freecad-mcp 0.1.32，stdio 传输，暴露 18 个工具，MCP SDK 1.30.0 |
| 执行层 | FreeCAD 1.1.4，PartDesign 参数化建模，FreeCADCmd 无界面执行 |

调用链路：自然语言 → 模型选择 `execute_code_headless` → JSON-RPC over stdio →
独立 FreeCADCmd 进程 → PartDesign 特征树 + Spreadsheet 参数表 → FCStd / STEP / STL / build_report。

## 模型说明

FCStd 里是一棵真正的 PartDesign 特征树，不是导入实体：

```
Body
├── BasePlate        AdditiveBox
├── CornerFillet     Fillet
├── M4_Hole_1..4     SubtractiveCylinder
Params               Spreadsheet（所有尺寸单元格带别名）
```

特征尺寸写成表达式（如 `Params.length / 2 - Params.hole_dx`），改参数表的一个数字，
整块板连同孔位、圆角一起重算，不需要改代码。

几何参数：长 120 mm、宽 60 mm、厚 10 mm、圆角 R3、孔径 Ø4.5（M4 间隙孔）、孔位 ±50 / ±20 mm。

## 验证结果

| 指标 | 结果 |
| --- | --- |
| 体积 | 71 286.571 mm³（STL 网格积分 71 287.98，差 0.002%） |
| 理论体积 | 71 286.571 mm³（72 000 − 4 孔 636.17 − 4 圆角 77.26） |
| 表面积 | 18 371.296 mm² |
| 拓扑 | 14 面 / 36 边 / 1 个实体，`Shape.isValid() == True` |
| 包围盒 | 120.000 × 60.000 × 10.000 mm |
| 改厚度 10→15 | 体积 71 286.571 → 106 929.856，比值 1.500000 |

三次参数化测试的结果与解析计算逐位吻合。

## 复现

完整步骤见 `初赛作品/03_可复现配置/复现说明.md`，精简版：

```powershell
# 1. 依赖（MCP SDK 必须 <2，2.x 改了 API 会连不上）
python -m venv D:\mcp-cup\.venv
D:\mcp-cup\.venv\Scripts\python.exe -m pip install "mcp[cli]<2" "freecad-mcp==0.1.32"

# 2. 直接跑构建脚本（离线复现，不经过 MCP）
D:\FreeCAD\bin\FreeCADCmd.exe 初赛作品\03_可复现配置\build_bracket.py

# 3. 或走 MCP，与 AI 调用完全相同的链路（带完整日志）
python 初赛作品\03_可复现配置\run_via_mcp.py
```

预期输出含 `"ok": true`、`"volume_mm3": 71286.571`、`"valid": true`。

注意：配置和文档里的 `D:\mcp-cup`、`D:\FreeCAD` 是作者本机路径，换机器要改
`freecad_mcp_launcher.py` 里的 `FREECADCMD` 常量和 `params.json` 的 `output_dir`。

## 说明

- 建模、脚本编写与文档整理过程使用了 AI 辅助；所有几何数据、调用日志与校验结果均由本地程序实际运行产生。
