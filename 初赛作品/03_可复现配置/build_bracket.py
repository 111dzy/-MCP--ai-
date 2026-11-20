"""Parametric mounting bracket - FreeCAD 1.1 / PartDesign.

Usage:
  FreeCADCmd.exe build_bracket.py [params.json]

Or from freecad-mcp execute_code_headless:
  PARAMS_PATH = r"D:/mcp-cup/project/bracket/params.json"
  exec(open(r"D:/mcp-cup/project/bracket/build_bracket.py", encoding="utf-8").read())

The model is fully parametric inside FreeCAD: every dimension is driven by
the spreadsheet "Params" (aliases length/width/thickness/...), so the file can
be edited in the GUI and recomputed without touching Python.
"""

import hashlib
import json
import os
import sys

import FreeCAD

DEFAULT_PARAMS = r"D:/mcp-cup/project/bracket/params.json"


def load_params():
    path = globals().get("PARAMS_PATH", DEFAULT_PARAMS)
    for arg in sys.argv[1:]:
        if arg.lower().endswith(".json"):
            path = arg
            break
    with open(path, "r", encoding="utf-8") as fh:
        return path, json.load(fh)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def vertical_edges(shape, thickness):
    """Return names of the 4 edges parallel to Z (the vertical corners)."""
    names = []
    for i, edge in enumerate(shape.Edges, start=1):
        verts = edge.Vertexes
        if len(verts) != 2:
            continue
        a, b = verts[0].Point, verts[1].Point
        if (abs(a.x - b.x) < 1e-6 and abs(a.y - b.y) < 1e-6
                and abs(abs(a.z - b.z) - thickness) < 1e-6):
            names.append("Edge%d" % i)
    return names


def main():
    params_path, p = load_params()
    out_dir = p.get("output_dir", r"D:/mcp-cup/out")
    os.makedirs(out_dir, exist_ok=True)

    doc = FreeCAD.newDocument("Bracket")
    doc.Label = "Parametric Bracket 120x60x10"

    # --- parameter table (editable in the GUI, drives every feature) --------
    sheet = doc.addObject("Spreadsheet::Sheet", "Params")
    sheet.set("A1", "parameter")
    sheet.set("B1", "value")
    sheet.set("C1", "unit")
    rows = [
        ("length", p["length"], "mm", "Length direction, X"),
        ("width", p["width"], "mm", "Width direction, Y"),
        ("thickness", p["thickness"], "mm", "Plate thickness, Z"),
        ("corner_radius", p["corner_radius"], "mm", "Vertical corner fillet R"),
        ("hole_diameter", p["hole_diameter"], "mm", "M4 clearance hole"),
        ("hole_dx", p["hole_dx"], "mm", "Hole centre offset from centre, X"),
        ("hole_dy", p["hole_dy"], "mm", "Hole centre offset from centre, Y"),
    ]
    for row, (name, value, unit, note) in enumerate(rows, start=2):
        sheet.set("A%d" % row, name)
        sheet.set("B%d" % row, str(value))
        sheet.set("C%d" % row, unit)
        sheet.set("D%d" % row, note)
        sheet.setAlias("B%d" % row, name)
    sheet.setColumnWidth("A", 130)
    sheet.setColumnWidth("B", 90)
    sheet.setColumnWidth("D", 260)

    # --- solid model -------------------------------------------------------
    body = doc.addObject("PartDesign::Body", "Body")
    body.Label = "Bracket"

    box = doc.addObject("PartDesign::AdditiveBox", "BasePlate")
    box.Label = "BasePlate"
    body.addObject(box)
    box.setExpression("Length", "Params.length")
    box.setExpression("Width", "Params.width")
    box.setExpression("Height", "Params.thickness")
    doc.recompute()

    corners = vertical_edges(box.Shape, p["thickness"])
    if len(corners) != 4:
        raise RuntimeError("expected 4 vertical edges, found %d: %s" % (len(corners), corners))

    fillet = doc.addObject("PartDesign::Fillet", "CornerFillet")
    fillet.Label = "CornerFillet_R3"
    fillet.Base = (box, corners)
    fillet.setExpression("Radius", "Params.corner_radius")
    body.addObject(fillet)
    doc.recompute()

    signs = ((1, 1), (1, -1), (-1, 1), (-1, -1))
    hole_names = []
    for idx, (sx, sy) in enumerate(signs, start=1):
        hole = doc.addObject("PartDesign::SubtractiveCylinder", "Hole%d" % idx)
        hole.Label = "M4_Hole_%d" % idx
        hole.setExpression("Radius", "Params.hole_diameter / 2")
        hole.setExpression("Height", "Params.thickness * 4")
        hole.setExpression("Placement.Base.x",
                           "Params.length / 2 %s Params.hole_dx" % ("+" if sx > 0 else "-"))
        hole.setExpression("Placement.Base.y",
                           "Params.width / 2 %s Params.hole_dy" % ("+" if sy > 0 else "-"))
        hole.setExpression("Placement.Base.z", "-Params.thickness")
        body.addObject(hole)
        doc.recompute()
        hole_names.append(hole.Name)

    doc.recompute()
    body.Tip = doc.getObject(hole_names[-1])
    doc.recompute()

    shape = body.Shape
    bb = shape.BoundBox
    valid = bool(shape.isValid())
    solids = len(shape.Solids)

    # --- exports -----------------------------------------------------------
    stl_path = os.path.join(out_dir, "bracket.stl")
    step_path = os.path.join(out_dir, "bracket.step")
    fcstd_path = os.path.join(out_dir, "bracket.FCStd")

    import Mesh
    import MeshPart
    mesh = MeshPart.meshFromShape(
        Shape=shape,
        LinearDeflection=float(p.get("stl_linear_deflection", 0.02)),
        AngularDeflection=float(p.get("stl_angular_deflection", 0.3)),
        Relative=False,
    )
    mesh.write(stl_path)
    shape.exportStep(step_path)
    doc.saveAs(fcstd_path)

    result = {
        "ok": valid and solids == 1,
        "params_file": params_path,
        "params": p,
        "volume_mm3": round(shape.Volume, 3),
        "area_mm2": round(shape.Area, 3),
        "faces": len(shape.Faces),
        "edges": len(shape.Edges),
        "solids": solids,
        "valid": valid,
        "bbox_mm": [round(bb.XLength, 3), round(bb.YLength, 3), round(bb.ZLength, 3)],
        "triangle_count": mesh.CountFacets,
        "files": {},
    }
    for key, path in (("stl", stl_path), ("step", step_path), ("fcstd", fcstd_path)):
        result["files"][key] = {
            "path": path,
            "bytes": os.path.getsize(path),
            "sha256": sha256(path),
        }

    report_path = os.path.join(out_dir, "build_report.json")
    with open(report_path, "w", encoding="utf-8") as fh:
        json.dump(result, fh, ensure_ascii=False, indent=2)
    result["files"]["report"] = {"path": report_path}

    print("RESULT_JSON " + json.dumps(result, ensure_ascii=False))
    return result


main()
