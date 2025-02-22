# dotfiles-nix

A repo to host a declarative macOS setup

---

## Provisioning a new macOS machine from scratch

### Hostname

- Set hostname of machine

```bash
sudo scutil ––set ComputerName YourComputerName
sudo scutil ––set HostName YourHostName
sudo scutil ––set LocalHostName YourLocalHostName
```

### User

- create admin user and login

### Dependencies

- Install `nix`

```bash
curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | \
  sh -s -- install --determinate
```

### Clone repo and set up flake with hostname

```bash
git clone https://github.com/eyevanovich/nix.git ~/.config/nix && cd ~/.config/nix
```

### Setup

#### First run

```bash
  nix run nix-darwin --extra-experimental-features nix-command --extra-experimental-features flakes -- switch --flake ~/.config/nix --impure
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
  echo /etc/profiles/per-user/ipiesh/bin/fish | sudo tee -a /etc/shells
  chsh -s /etc/profiles/per-user/ipiesh/bin/fish
```

#### References
- [A great blog post on how to manage dotfiles with home-manager](https://alex.pearwin.com/2021/07/managing-dotfiles-with-nix/)
- [home-manager module/programs reference](https://github.com/nix-community/home-manager/tree/master/modules/programs)
- [A repo I used to mimic my code setup](https://github.com/ryan4yin/nix-darwin-kickstarter/tree/main)
