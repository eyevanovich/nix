# dotfiles-nix

A repo to host a declarative macOS setup

---

## Provisioning a new macOS machine from scratch

### User

- create admin user `ipiesh`

### Dependencies

- Install `nix`

```bash
  curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install
```

- Install `homebrew`

```bash
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### Clone repo

- `git clone https://github.com/eyevanovich/nix.git` within `~/.config/`

### Setup

#### without Justfile

```bash
  nix run nix-darwin --extra-experimental-features nix-command --extra-experimental-features flakes -- switch --flake ~/.config/nix
  darwin-rebuild switch --flake ~/.config/nix
```

#### with Justfile

```bash
  just darwin
```

#### References
- https://davi.sh/blog/2024/01/nix-darwin/
- https://github.com/ryan4yin/nix-darwin-kickstarter/tree/main
