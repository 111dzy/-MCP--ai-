"""Launch freecad-mcp with fixed arguments (works around clients that pass args as one string)."""
import sys

FREECADCMD = r"D:\FreeCAD\bin\FreeCADCmd.exe"

sys.argv = ["freecad-mcp", "--freecadcmd", FREECADCMD]

from freecad_mcp.server import main

if __name__ == "__main__":
    main()
