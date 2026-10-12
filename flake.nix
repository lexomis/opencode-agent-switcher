{
  description = "OpenCode priority plugin development environment";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    { nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
        nodeVersion = pkgs.lib.trim (builtins.readFile ./.node-version);
        nodejs =
          pkgs."nodejs_${nodeVersion}" or (throw "Unsupported node version in .node-version: ${nodeVersion}");
        shellWrapper = pkgs.writeShellScript "nix-develop-shell" ''
          exec "''${SHELL}" -i
        '';
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = [
            nodejs
            pkgs.pnpm
            pkgs.biome
          ];
          shell = shellWrapper;
          shellHook = ''
            export BIOME="${pkgs.biome}/bin/biome"
            echo "dev shell: node version: $(node --version), biome version: $(biome --version)"
          '';
        };
      }
    );
}
