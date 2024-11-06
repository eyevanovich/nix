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
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" && \
  (echo; echo 'eval "$(/opt/homebrew/bin/brew shellenv)"') >> /Users/ipiesh/.zprofile && \
  eval "$(/opt/homebrew/bin/brew shellenv)"
```

### Clone repo

- `git clone https://github.com/eyevanovich/nix.git ~/.config/nix`

### Setup

#### First run

```bash
  nix run nix-darwin --extra-experimental-features nix-command --extra-experimental-features flakes -- switch --flake ~/.config/nix
```

#### with Taskfile thereafter

```bash
  // first time
  task build

  // there after
  task rebuild
```

#### Set fish as default shell
```bash
  echo /etc/profiles/per-user/ipiesh/bin/fish | sudo tee -a /etc/shells && \
  chsh -s /etc/profiles/per-user/ipiesh/bin/fish
```

#### References
- [A great blog post on how to manage dotfiles with home-manager](https://alex.pearwin.com/2021/07/managing-dotfiles-with-nix/)
- [home-manager module/programs reference](https://github.com/nix-community/home-manager/tree/master/modules/programs)
- [A repo I used to mimic my code setup](https://github.com/ryan4yin/nix-darwin-kickstarter/tree/main)
