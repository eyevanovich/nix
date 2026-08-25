{inputs}: [
  # Pin localstack to working nixpkgs rev (python3.13-plux test broken on unstable)
  (final: prev: {
    localstack =
      (import inputs.nixpkgs-localstack {
        system = final.stdenv.hostPlatform.system;
      }).localstack;
  })
  # direnv 2.37.1 not yet in darwin binary cache; its test phase
  # (./test/direnv-test.zsh) hangs indefinitely under the build sandbox.
  (final: prev: {
    direnv = prev.direnv.overrideAttrs (_: {
      doCheck = false;
      doInstallCheck = false;
    });
  })
  (final: prev: let
    python = final.python313Packages;
    headroomTreeSitterLanguagePack = python.buildPythonPackage rec {
      pname = "tree-sitter-language-pack";
      version = "0.13.0";
      pyproject = true;

      src = final.fetchPypi {
        pname = "tree_sitter_language_pack";
        inherit version;
        hash = "sha256-AyA0xeJ7H24AcwuefC28ggO0cA0MaB/QGdbe/PYRg+w=";
      };

      postPatch = ''
        substituteInPlace pyproject.toml \
          --replace-fail "typing-extensions>=4.15.0" "typing-extensions>=4.14.1"
      '';

      build-system = [
        python.cython
        python.setuptools
        python.typing-extensions
      ];

      dependencies = [
        python.tree-sitter
        python.tree-sitter-c-sharp
        python.tree-sitter-embedded-template
        python.tree-sitter-yaml
      ];

      pythonRelaxDeps = [
        "tree-sitter"
        "tree-sitter-embedded-template"
        "tree-sitter-yaml"
      ];

      doCheck = false;
      pythonImportsCheck = [
        "tree_sitter_language_pack"
        "tree_sitter_language_pack.bindings"
      ];
    };
  in {
    headroom-tree-sitter-language-pack = headroomTreeSitterLanguagePack;

    headroom-ai-package = python.buildPythonPackage rec {
      pname = "headroom-ai";
      version = "0.36.5";
      format = "wheel";

      src = final.fetchurl {
        name = "headroom_ai-${version}-cp310-abi3-macosx_11_0_arm64.whl";
        url = "https://files.pythonhosted.org/packages/1b/99/410b64a578f36d249b76915d733873192537e986b2bc911373e6d72839e9/headroom_ai-${version}-cp310-abi3-macosx_11_0_arm64.whl";
        hash = "sha256-AZDFXwInYNSfYmjzwJcEOPm91acrwCiOJ4j/fouM5zA=";
      };

      dependencies = [
        python.tiktoken
        python.pydantic
        python.litellm
        python.click
        python.rich
        python.opentelemetry-api
        python.pyyaml
        python.tomlkit
        python.fastapi
        python.uvicorn
        python.orjson
        python.httpx
        python.h2
        python.openai
        python.mcp
        python.magika
        python.zstandard
        python.websockets
        python.onnxruntime
        python.transformers
        python.watchdog
        python.sqlite-vec
        python.tree-sitter
        headroomTreeSitterLanguagePack
      ];

      # Headroom invokes ast-grep as a CLI. nixpkgs packages that executable at
      # the top level instead of as the ast-grep-cli PyPI distribution.
      pythonRemoveDeps = ["ast-grep-cli"];

      doCheck = false;
      pythonImportsCheck = ["headroom"];

      meta = {
        description = "Context optimization layer for LLM applications";
        homepage = "https://github.com/headroomlabs-ai/headroom";
        license = final.lib.licenses.asl20;
        platforms = ["aarch64-darwin"];
      };
    };

    headroom-python = final.python313.withPackages (_: [final.headroom-ai-package]);

    headroom-ai = final.writeShellScriptBin "headroom" ''
      export PATH="${final.lib.makeBinPath [final.ast-grep]}:$PATH"
      exec ${final.headroom-python}/bin/python -m headroom.cli "$@"
    '';

    headroom-pi = final.writeShellApplication {
      name = "headroom-pi";
      runtimeInputs = [final.headroom-ai];
      text = ''
        export HEADROOM_TELEMETRY="''${HEADROOM_TELEMETRY:-off}"
        export HEADROOM_SAVINGS_PROFILE="''${HEADROOM_SAVINGS_PROFILE:-coding}"
        export HEADROOM_CCR_TTL_SECONDS="''${HEADROOM_CCR_TTL_SECONDS:-7200}"
        export HEADROOM_EXCLUDE_TOOLS="''${HEADROOM_EXCLUDE_TOOLS:-headroom_retrieve}"
        export HEADROOM_CODE_AWARE_ENABLED="''${HEADROOM_CODE_AWARE_ENABLED:-1}"

        exec headroom "$@"
      '';
    };
  })
]
