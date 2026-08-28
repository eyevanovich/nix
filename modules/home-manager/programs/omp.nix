# Oh My Pi is a separate Pi fork. Keep its binary and ~/.omp state independent
# from the upstream Pi installation managed by pi.nix.
{omp, ...}: {
  imports = [omp.homeManagerModules.default];

  programs.omp.enable = true;
}
