"""Package official Darwin Electron runtimes without losing Unix links/modes.

For Windows builds, run with Developer Mode enabled (symlink creation) and Python.
The included first-launch command signs and verifies the bundle on the target Mac.
Normal macOS builds can instead use npm run build:mac.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import plistlib
import shutil
import stat
import struct
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument("--downloads", type=Path, required=True)
parser.add_argument("--staging", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
version = json.loads((root / "package.json").read_text(encoding="utf-8"))["version"]
electron_version = "31.7.7"
asar = root / "dist/win-unpacked/resources/app.asar"
assert asar.is_file(), "Build the shared app.asar first"
sums = {}
for line in (args.downloads / "SHASUMS256.txt").read_text().splitlines():
    digest, name = line.split(maxsplit=1)
    sums[name.lstrip("*")] = digest
args.output.mkdir(parents=True, exist_ok=True)
entitlements = {
    "com.apple.security.cs.allow-jit": True,
    "com.apple.security.cs.allow-unsigned-executable-memory": True,
    "com.apple.security.cs.disable-library-validation": True,
}

for arch in ("arm64", "x64"):
    archive = args.downloads / f"electron-v{electron_version}-darwin-{arch}.zip"
    assert hashlib.file_digest(archive.open("rb"), "sha256").hexdigest() == sums[archive.name], "Official runtime checksum mismatch"
    stage = args.staging / arch
    if stage.exists():
        raise RuntimeError(f"Staging directory already exists: {stage}; choose a new one")
    stage.mkdir(parents=True)
    app = stage / "codex-quota.app"
    modes = {}
    links = []
    with zipfile.ZipFile(archive) as z:
        for item in z.infolist():
            if not item.filename.startswith("Electron.app/"):
                if item.filename in ("LICENSE", "LICENSES.chromium.html"):
                    (stage / item.filename).write_bytes(z.read(item))
                continue
            relative = PurePosixPath(item.filename).relative_to("Electron.app")
            if ".." in relative.parts:
                raise RuntimeError("Unexpected runtime path")
            target = app.joinpath(*relative.parts)
            mode = item.external_attr >> 16
            modes[relative.as_posix()] = mode
            if stat.S_ISLNK(mode):
                links.append((target, z.read(item).decode("utf-8")))
            elif item.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(z.read(item))
    # Directory links first, as other framework links traverse Versions/Current.
    links.sort(key=lambda pair: 0 if pair[0].name == "Current" else 1)
    for target, destination in links:
        target_is_directory = target.name in ("Current", "Resources", "Libraries", "Helpers", "Headers")
        os.symlink(destination, target, target_is_directory=target_is_directory)

    contents = app / "Contents"
    info_path = contents / "Info.plist"
    info = plistlib.loads(info_path.read_bytes())
    info.update(CFBundleName="codex-quota", CFBundleDisplayName="codex-quota",
                CFBundleIdentifier="cn.codex.quota.widget", CFBundleShortVersionString=version,
                CFBundleVersion=version, CFBundleIconFile="app-icon.icns", LSUIElement=True,
                NSHighResolutionCapable=True, NSPrincipalClass="AtomApplication")
    asar_data = asar.read_bytes()
    header_length = struct.unpack_from("<I", asar_data, 12)[0]
    info["ElectronAsarIntegrity"] = {"Resources/app.asar": {
        "algorithm": "SHA256", "hash": hashlib.sha256(asar_data[16:16+header_length]).hexdigest()
    }}
    info_path.write_bytes(plistlib.dumps(info))
    resources = contents / "Resources"
    shutil.copyfile(asar, resources / "app.asar")
    shutil.copyfile(root / "assets/app-icon.icns", resources / "app-icon.icns")
    (resources / "default_app.asar").unlink(missing_ok=True)

    (stage / "entitlements.plist").write_bytes(plistlib.dumps(entitlements))
    (stage / "First Launch.command").write_text('''#!/bin/bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Please run this file on a Mac."; exit 1
fi
APP="$PWD/codex-quota.app"
if [[ ! -f "$APP/Contents/MacOS/Electron" ]]; then
  echo "Please extract the entire ZIP first and keep these files together."; exit 1
fi
echo "Preparing codex-quota on this Mac (local ad-hoc signature)..."
/usr/bin/codesign --force --deep --sign - --timestamp=none --entitlements "$PWD/entitlements.plist" "$APP"
/usr/bin/codesign --verify --deep --strict "$APP"
echo "Local signature verified. Opening the panel..."
/usr/bin/open "$APP"
echo "Next time you can open codex-quota.app directly."
''', encoding="utf-8", newline="\n")
    (stage / "README.txt").write_text(f'''codex-quota {version} - macOS {arch}

这是 Mac 测试版，尚未在真实 Mac 上运行验证。不是 Apple Developer ID 签名或公证版本。
应用包含完整运行时，不需要安装 Node.js。

1. 在 Mac 上解压整个 ZIP；不要在 Windows 上解压再复制，以免丢失执行权限和符号链接。
2. 双击 First Launch.command，为本应用生成本机签名并验证后启动。不需要管理员权限或 Apple 开发者账号。
3. 如果 macOS 拦截，请先尝试打开一次，再到“系统设置 → 隐私与安全性”中允许打开。
   请保留系统安全设置；本包不会修改 Gatekeeper 或移除隔离属性。
4. 以后可直接打开 codex-quota.app，也可以把它移到“应用程序”文件夹。
5. 本机须已安装并登录 Codex 桌面版或 CLI；不需要另外填写 API key。

双击小窗口隐藏；单击菜单栏图标恢复。右键菜单栏图标只有显示／隐藏、刷新额度、置顶／取消置顶、退出。
也可以再次打开应用恢复已隐藏的窗口。双击按钮不会触发隐藏，拖动功能保留。
默认每 3 分钟刷新一次；隐藏后降低刷新频率。
Apple 芯片请选择 arm64；Intel Mac 请选择 x64。

如果签名或运行失败，请保留 First Launch.command 窗口中的错误信息。
''', encoding="utf-8")

    output = args.output / f"codex-quota-{version}-mac-{arch}.zip"
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for dirpath, dirnames, filenames in os.walk(app, followlinks=False):
            for name in sorted(dirnames + filenames):
                item = Path(dirpath) / name
                relative = item.relative_to(app).as_posix()
                zip_name = f"{app.name}/{relative}"
                zi = zipfile.ZipInfo(zip_name, (2026, 10, 29, 12, 0, 0))
                zi.create_system = 3
                if item.is_symlink():
                    zi.external_attr = (stat.S_IFLNK | 0o755) << 16
                    data = os.readlink(item).replace("\\", "/").encode()
                elif item.is_dir():
                    zi.filename += "/"
                    zi.external_attr = ((stat.S_IFDIR | 0o755) << 16) | 0x10
                    data = b""
                else:
                    original_mode = modes.get(relative, stat.S_IFREG | 0o644)
                    zi.external_attr = original_mode << 16
                    data = item.read_bytes()
                zi.compress_type = zipfile.ZIP_DEFLATED
                z.writestr(zi, data)
        for name in ("LICENSE", "LICENSES.chromium.html", "README.txt", "entitlements.plist", "First Launch.command"):
            if (stage / name).exists():
                zi = zipfile.ZipInfo(name, (2026, 10, 29, 12, 0, 0))
                zi.create_system = 3
                zi.external_attr = (stat.S_IFREG | (0o755 if name.endswith(".command") else 0o644)) << 16
                zi.compress_type = zipfile.ZIP_DEFLATED
                z.writestr(zi, (stage / name).read_bytes())
    # Validate the deliverable, including the executable and framework links.
    with zipfile.ZipFile(output) as z:
        assert z.testzip() is None
        main = z.getinfo(f"{app.name}/Contents/MacOS/Electron")
        assert main.external_attr >> 16 & stat.S_IXUSR
        assert len([i for i in z.infolist() if stat.S_ISLNK(i.external_attr >> 16)]) == len(links)
        assert z.read(f"{app.name}/Contents/Resources/app.asar") == asar.read_bytes()
    print(f"Verified {output.name}: executable modes, {len(links)} symlinks, archive CRC, shared app.asar.", flush=True)
