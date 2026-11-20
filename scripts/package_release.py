"""把原生构建产物打包为 CPA 商店使用的 GitHub Release 资产。"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
PLATFORMS = {"linux": ".so", "windows": ".dll"}


def release_identity(tag):
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    registry = json.loads((ROOT / "store/registry.json").read_text(encoding="utf-8"))
    plugin_id, version = package["name"], package["version"]
    if not re.fullmatch(r"\d+\.\d+\.\d+", version) or (tag and tag != "v" + version):
        raise ValueError("发布标签须与 package.json 中的三段版本一致")
    if registry["plugins"][0]["id"] != plugin_id:
        raise ValueError("商店插件 ID 与包名不一致")
    source = (ROOT / "cmd/downshift/plugin.go").read_text(encoding="utf-8")
    for key, expected in (("pluginID", plugin_id), ("version", version)):
        if not re.search(rf'^const {key} = "{re.escape(expected)}"$', source, re.M):
            raise ValueError(f"插件注册的 {key} 与发布配置不一致")
    return plugin_id, version


def package_library(plugin_id, version, platform, output):
    extension = PLATFORMS[platform]
    library = ROOT / "build" / platform / "amd64" / f"{plugin_id}-v{version}{extension}"
    archive = output / f"{plugin_id}_{version}_{platform}_amd64.zip"
    temporary = archive.with_suffix(".zip.tmp")
    try:
        with ZipFile(temporary, "w", compression=ZIP_DEFLATED) as bundle:
            bundle.write(library, plugin_id + extension)
            for notice in ("THIRD_PARTY_NOTICES.md", "internal/fingerprint/PORT_LICENSE", "internal/fingerprint/data/LICENSE"):
                bundle.write(ROOT / notice, notice)
        os.replace(temporary, archive)
    finally:
        temporary.unlink(missing_ok=True)


def write_checksums(plugin_id, version, output):
    lines = []
    for platform, extension in PLATFORMS.items():
        archive = output / f"{plugin_id}_{version}_{platform}_amd64.zip"
        with ZipFile(archive) as bundle:
            libraries = [n for n in bundle.namelist() if n.endswith((".so", ".dll", ".dylib"))]
            if libraries != [plugin_id + extension] or bundle.testzip():
                raise ValueError(f"发布包结构或内容无效：{archive.name}")
        digest = hashlib.sha256(archive.read_bytes()).hexdigest()
        lines.append(f"{digest}  {archive.name}\n")
    (output / "checksums.txt").write_bytes("".join(lines).encode("ascii"))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--platform", choices=PLATFORMS, help="打包一个已编译的平台")
    action.add_argument("--checksums", action="store_true", help="验证两个平台的归档并生成 checksums.txt")
    parser.add_argument("--tag", help="核对发布标签，例如 v0.1.3")
    args = parser.parse_args()
    plugin_id, version = release_identity(args.tag)
    output = ROOT / "build" / "release" / version
    output.mkdir(parents=True, exist_ok=True)
    if args.platform:
        package_library(plugin_id, version, args.platform, output)
    else:
        write_checksums(plugin_id, version, output)
