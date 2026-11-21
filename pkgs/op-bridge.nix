# scripts/op_bridge.py installed under `name`: `op-bridge` on the Mac (serves the
# real 1Password CLI) or `op` on a headless host (forwards read/inject/run to the Mac).
{
  stdenvNoCC,
  python3,
  name,
}:
stdenvNoCC.mkDerivation {
  pname = name;
  version = "0.1.0";
  src = ../scripts/op_bridge.py;
  dontUnpack = true;
  buildInputs = [python3];
  installPhase = ''
    install -Dm755 $src $out/bin/${name}
    patchShebangs $out/bin/${name}
  '';
  meta.mainProgram = name;
}
