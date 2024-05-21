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
- `git clone git@github.com:eyevanovich/nix.git` within `~/.config/`

### Build Nix stores

```bash
  nix build .
```

