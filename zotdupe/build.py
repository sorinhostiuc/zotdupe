import json
import os
import zipfile


BASE = os.path.dirname(os.path.abspath(__file__))
REPOSITORY = os.path.dirname(BASE)

with open(os.path.join(BASE, "manifest.json"), "r", encoding="utf-8") as file:
    version = json.load(file)["version"]

xpi_path = os.path.join(REPOSITORY, f"zotdupe-{version}.xpi")
runtime_roots = {"src", "icons", "locale"}
runtime_files = {"manifest.json", "bootstrap.js", "prefs.xhtml"}
entries = []

for root, dirs, files in os.walk(BASE):
    relative_root = os.path.relpath(root, BASE)
    if relative_root == ".":
        dirs[:] = [directory for directory in dirs if directory in runtime_roots]
    elif relative_root.split(os.sep, 1)[0] not in runtime_roots:
        dirs[:] = []
        continue

    for name in files:
        relative = os.path.relpath(os.path.join(root, name), BASE)
        archive_name = relative.replace(os.sep, "/")
        top = relative.split(os.sep, 1)[0]
        if relative_root == "." and name not in runtime_files:
            continue
        if relative_root != "." and top not in runtime_roots:
            continue
        if name == ".DS_Store" or archive_name.startswith("__MACOSX/") or name.endswith(".css.bak"):
            continue
        entries.append((archive_name, os.path.join(root, name)))

entries.sort(key=lambda entry: entry[0])
with zipfile.ZipFile(xpi_path, "w", zipfile.ZIP_DEFLATED) as archive:
    for archive_name, full_path in entries:
        archive.write(full_path, archive_name)

print(xpi_path)
