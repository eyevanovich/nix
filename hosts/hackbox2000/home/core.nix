{pkgs, ...}: {
  # This value determines the home Manager release that your
  # configuration is compatible with. This helps avoid breakage
  # when a new home Manager release introduces backwards
  # incompatible changes.
  #
  # You can update home Manager without changing this value. See
  # the home Manager release notes for a list of state version
  # changes in each release.
  home.stateVersion = "23.11";
  home.packages = with pkgs; [
    # utils
    jq # A lightweight and flexible command-line JSON processor
    yq-go # yaml processer https://github.com/mikefarah/yq
    kubectx
    awscli
    pre-commit
    fzf

    # langs
    go

    # productivity
    glow # markdown previewer in terminal
    bat # better cat
    btop # better top
    yazi # file explorer
    tealdeer # tldr in rust
    lazygit # git TUI
    direnv
    just # justfile
    fd # better find
    devbox
    go-task # taskfile
    zoxide # better cd

    # misc
    cowsay
    tree
    neofetch
    grc # for color command output
  ];

  home.file.karabiner = {
    target = ".config/karabiner/assets/complex_modifications/nix.json";
    text = ''
            {
          "global": {
              "ask_for_confirmation_before_quitting": true,
              "check_for_updates_on_startup": true,
              "show_in_menu_bar": true,
              "show_profile_name_in_menu_bar": false,
              "unsafe_ui": false
          },
          "profiles": [
              {
                  "complex_modifications": {
                      "parameters": {
                          "basic.simultaneous_threshold_milliseconds": 50,
                          "basic.to_delayed_action_delay_milliseconds": 500,
                          "basic.to_if_alone_timeout_milliseconds": 1000,
                          "basic.to_if_held_down_threshold_milliseconds": 500,
                          "mouse_motion_to_scroll.speed": 100
                      },
                      "rules": [
                          {
                              "description": "Change caps_lock to left_control if pressed with other keys, change caps_lock to escape if pressed alone.",
                              "manipulators": [
                                  {
                                      "from": {
                                          "key_code": "caps_lock",
                                          "modifiers": {
                                              "optional": [
                                                  "any"
                                              ]
                                          }
                                      },
                                      "to": [
                                          {
                                              "key_code": "left_control"
                                          }
                                      ],
                                      "to_if_alone": [
                                          {
                                              "key_code": "escape"
                                          }
                                      ],
                                      "type": "basic"
                                  }
                              ]
                          }
                      ]
                  },
                  "devices": [
                      {
                          "disable_built_in_keyboard_if_exists": false,
                          "fn_function_keys": [],
                          "game_pad_swap_sticks": false,
                          "identifiers": {
                              "is_game_pad": false,
                              "is_keyboard": true,
                              "is_pointing_device": true,
                              "product_id": 591,
                              "vendor_id": 1452
                          },
                          "ignore": true,
                          "manipulate_caps_lock_led": true,
                          "mouse_flip_horizontal_wheel": false,
                          "mouse_flip_vertical_wheel": false,
                          "mouse_flip_x": false,
                          "mouse_flip_y": false,
                          "mouse_swap_wheels": false,
                          "mouse_swap_xy": false,
                          "simple_modifications": [],
                          "treat_as_built_in_keyboard": false
                      },
                      {
                          "disable_built_in_keyboard_if_exists": false,
                          "fn_function_keys": [],
                          "game_pad_swap_sticks": false,
                          "identifiers": {
                              "is_game_pad": false,
                              "is_keyboard": true,
                              "is_pointing_device": false,
                              "product_id": 835,
                              "vendor_id": 1452
                          },
                          "ignore": false,
                          "manipulate_caps_lock_led": true,
                          "mouse_flip_horizontal_wheel": false,
                          "mouse_flip_vertical_wheel": false,
                          "mouse_flip_x": false,
                          "mouse_flip_y": false,
                          "mouse_swap_wheels": false,
                          "mouse_swap_xy": false,
                          "simple_modifications": [],
                          "treat_as_built_in_keyboard": false
                      },
                      {
                          "disable_built_in_keyboard_if_exists": false,
                          "fn_function_keys": [],
                          "game_pad_swap_sticks": false,
                          "identifiers": {
                              "is_game_pad": false,
                              "is_keyboard": false,
                              "is_pointing_device": true,
                              "product_id": 835,
                              "vendor_id": 1452
                          },
                          "ignore": true,
                          "manipulate_caps_lock_led": false,
                          "mouse_flip_horizontal_wheel": false,
                          "mouse_flip_vertical_wheel": false,
                          "mouse_flip_x": false,
                          "mouse_flip_y": false,
                          "mouse_swap_wheels": false,
                          "mouse_swap_xy": false,
                          "simple_modifications": [],
                          "treat_as_built_in_keyboard": false
                      },
                      {
                          "disable_built_in_keyboard_if_exists": false,
                          "fn_function_keys": [],
                          "game_pad_swap_sticks": false,
                          "identifiers": {
                              "is_game_pad": false,
                              "is_keyboard": true,
                              "is_pointing_device": false,
                              "product_id": 49281,
                              "vendor_id": 1133
                          },
                          "ignore": true,
                          "manipulate_caps_lock_led": true,
                          "mouse_flip_horizontal_wheel": false,
                          "mouse_flip_vertical_wheel": false,
                          "mouse_flip_x": false,
                          "mouse_flip_y": false,
                          "mouse_swap_wheels": false,
                          "mouse_swap_xy": false,
                          "simple_modifications": [],
                          "treat_as_built_in_keyboard": false
                      },
                      {
                          "disable_built_in_keyboard_if_exists": false,
                          "fn_function_keys": [],
                          "game_pad_swap_sticks": false,
                          "identifiers": {
                              "is_game_pad": false,
                              "is_keyboard": false,
                              "is_pointing_device": true,
                              "product_id": 49281,
                              "vendor_id": 1133
                          },
                          "ignore": true,
                          "manipulate_caps_lock_led": false,
                          "mouse_flip_horizontal_wheel": false,
                          "mouse_flip_vertical_wheel": false,
                          "mouse_flip_x": false,
                          "mouse_flip_y": false,
                          "mouse_swap_wheels": false,
                          "mouse_swap_xy": false,
                          "simple_modifications": [],
                          "treat_as_built_in_keyboard": false
                      },
                      {
                          "disable_built_in_keyboard_if_exists": false,
                          "fn_function_keys": [],
                          "game_pad_swap_sticks": false,
                          "identifiers": {
                              "is_game_pad": false,
                              "is_keyboard": true,
                              "is_pointing_device": false,
                              "product_id": 591,
                              "vendor_id": 1452
                          },
                          "ignore": false,
                          "manipulate_caps_lock_led": true,
                          "mouse_flip_horizontal_wheel": false,
                          "mouse_flip_vertical_wheel": false,
                          "mouse_flip_x": false,
                          "mouse_flip_y": false,
                          "mouse_swap_wheels": false,
                          "mouse_swap_xy": false,
                          "simple_modifications": [],
                          "treat_as_built_in_keyboard": false
                      },
                      {
                          "disable_built_in_keyboard_if_exists": false,
                          "fn_function_keys": [],
                          "game_pad_swap_sticks": false,
                          "identifiers": {
                              "is_game_pad": false,
                              "is_keyboard": true,
                              "is_pointing_device": false,
                              "product_id": 34304,
                              "vendor_id": 1452
                          },
                          "ignore": false,
                          "manipulate_caps_lock_led": true,
                          "mouse_flip_horizontal_wheel": false,
                          "mouse_flip_vertical_wheel": false,
                          "mouse_flip_x": false,
                          "mouse_flip_y": false,
                          "mouse_swap_wheels": false,
                          "mouse_swap_xy": false,
                          "simple_modifications": [],
                          "treat_as_built_in_keyboard": false
                      }
                  ],
                  "fn_function_keys": [
                      {
                          "from": {
                              "key_code": "f1"
                          },
                          "to": [
                              {
                                  "consumer_key_code": "display_brightness_decrement"
                              }
                          ]
                      },
                      {
                          "from": {
                              "key_code": "f2"
                          },
                          "to": [
                              {
                                  "consumer_key_code": "display_brightness_increment"
                              }
                          ]
                      },
                      {
                          "from": {
                              "key_code": "f3"
                          },
                          "to": [
                              {
                                  "apple_vendor_keyboard_key_code": "mission_control"
                              }
                          ]
                      },
                      {
                          "from": {
                              "key_code": "f4"
                          },
                          "to": [
                              {
                                  "apple_vendor_keyboard_key_code": "spotlight"
                              }
                          ]
                      },
                      {
                          "from": {
                              "key_code": "f5"
                          },
                          "to": [
                              {
                                  "consumer_key_code": "dictation"
                              }
                          ]
                      },
                      {
                          "from": {
                              "key_code": "f6"
                          },
                          "to": [
                              {
                                  "key_code": "f6"
                              }
                          ]
                      },
                      {
                          "from": {
                              "key_code": "f7"
                          },
                          "to": [
                              {
                                  "consumer_key_code": "rewind"
                              }
                          ]
                      },
                      {
                          "from": {
                              "key_code": "f8"
                          },
                          "to": [
                              {
                                  "consumer_key_code": "play_or_pause"
                              }
                          ]
                      },
                      {
                          "from": {
                              "key_code": "f9"
                          },
                          "to": [
                              {
                                  "consumer_key_code": "fast_forward"
                              }
                          ]
                      },
                      {
                          "from": {
                              "key_code": "f10"
                          },
                          "to": [
                              {
                                  "consumer_key_code": "mute"
                              }
                          ]
                      },
                      {
                          "from": {
                              "key_code": "f11"
                          },
                          "to": [
                              {
                                  "consumer_key_code": "volume_decrement"
                              }
                          ]
                      },
                      {
                          "from": {
                              "key_code": "f12"
                          },
                          "to": [
                              {
                                  "consumer_key_code": "volume_increment"
                              }
                          ]
                      }
                  ],
                  "name": "Default profile",
                  "parameters": {
                      "delay_milliseconds_before_open_device": 1000
                  },
                  "selected": true,
                  "simple_modifications": [],
                  "virtual_hid_keyboard": {
                      "country_code": 0,
                      "indicate_sticky_modifier_keys_state": true,
                      "mouse_key_xy_scale": 100
                  }
              },
              {
                  "complex_modifications": {
                      "parameters": {
                          "basic.simultaneous_threshold_milliseconds": 50,
                          "basic.to_delayed_action_delay_milliseconds": 500,
                          "basic.to_if_alone_timeout_milliseconds": 1000,
                          "basic.to_if_held_down_threshold_milliseconds": 500,
                          "mouse_motion_to_scroll.speed": 100
                      },
                      "rules": []
                  },
                  "devices": [
                      {
                          "disable_built_in_keyboard_if_exists": false,
                          "fn_function_keys": [],
                          "game_pad_swap_sticks": false,
                          "identifiers": {
                              "is_game_pad": false,
                              "is_keyboard": true,
                              "is_pointing_device": false,
                              "product_id": 835,
                              "vendor_id": 1452
                          },
                          "ignore": false,
                          "manipulate_caps_lock_led": true,
                          "mouse_flip_horizontal_wheel": false,
                          "mouse_flip_vertical_wheel": false,
                          "mouse_flip_x": false,
                          "mouse_flip_y": false,
                          "mouse_swap_wheels": false,
                          "mouse_swap_xy": false,
                          "simple_modifications": [],
                          "treat_as_built_in_keyboard": false
                      },
                      {
                          "disable_built_in_keyboard_if_exists": false,
                          "fn_function_keys": [],
                          "game_pad_swap_sticks": false,
                          "identifiers": {
                              "is_game_pad": false,
                              "is_keyboard": false,
                              "is_pointing_device": true,
                              "product_id": 835,
                              "vendor_id": 1452
                          },
                          "ignore": true,
                          "manipulate_caps_lock_led": false,
                          "mouse_flip_horizontal_wheel": false,
                          "mouse_flip_vertical_wheel": false,
                          "mouse_flip_x": false,
                          "mouse_flip_y": false,
                          "mouse_swap_wheels": false,
                          "mouse_swap_xy": false,
                          "simple_modifications": [],
                          "treat_as_built_in_keyboard": false
                      },
                      {
                          "disable_built_in_keyboard_if_exists": false,
                          "fn_function_keys": [],
                          "game_pad_swap_sticks": false,
                          "identifiers": {
                              "is_game_pad": false,
                              "is_keyboard": true,
                              "is_pointing_device": false,
                              "product_id": 49281,
                              "vendor_id": 1133
                          },
                          "ignore": false,
                          "manipulate_caps_lock_led": true,
                          "mouse_flip_horizontal_wheel": false,
                          "mouse_flip_vertical_wheel": false,
                          "mouse_flip_x": false,
                          "mouse_flip_y": false,
                          "mouse_swap_wheels": false,
                          "mouse_swap_xy": false,
                          "simple_modifications": [],
                          "treat_as_built_in_keyboard": false
                      },
                      {
                          "disable_built_in_keyboard_if_exists": false,
                          "fn_function_keys": [],
                          "game_pad_swap_sticks": false,
                          "identifiers": {
                              "is_game_pad": false,
                              "is_keyboard": false,
                              "is_pointing_device": true,
                              "product_id": 49281,
                              "vendor_id": 1133
                          },
                          "ignore": true,
                          "manipulate_caps_lock_led": false,
                          "mouse_flip_horizontal_wheel": false,
                          "mouse_flip_vertical_wheel": false,
                          "mouse_flip_x": false,
                          "mouse_flip_y": false,
                          "mouse_swap_wheels": false,
                          "mouse_swap_xy": false,
                          "simple_modifications": [],
                          "treat_as_built_in_keyboard": false
                      },
                      {
                          "disable_built_in_keyboard_if_exists": false,
                          "fn_function_keys": [],
                          "game_pad_swap_sticks": false,
                          "identifiers": {
                              "is_game_pad": false,
                              "is_keyboard": true,
                              "is_pointing_device": true,
                              "product_id": 591,
                              "vendor_id": 1452
                          },
                          "ignore": true,
                          "manipulate_caps_lock_led": true,
                          "mouse_flip_horizontal_wheel": false,
                          "mouse_flip_vertical_wheel": false,
                          "mouse_flip_x": false,
                          "mouse_flip_y": false,
                          "mouse_swap_wheels": false,
                          "mouse_swap_xy": false,
                          "simple_modifications": [],
                          "treat_as_built_in_keyboard": false
                      },
                      {
                          "disable_built_in_keyboard_if_exists": false,
                          "fn_function_keys": [],
                          "game_pad_swap_sticks": false,
                          "identifiers": {
                              "is_game_pad": false,
                              "is_keyboard": true,
                              "is_pointing_device": false,
                              "product_id": 591,
                              "vendor_id": 1452
                          },
                          "ignore": false,
                          "manipulate_caps_lock_led": true,
                          "mouse_flip_horizontal_wheel": false,
                          "mouse_flip_vertical_wheel": false,
                          "mouse_flip_x": false,
                          "mouse_flip_y": false,
                          "mouse_swap_wheels": false,
                          "mouse_swap_xy": false,
                          "simple_modifications": [],
                          "treat_as_built_in_keyboard": false
                      }
                  ],
                  "fn_function_keys": [
                      {
                          "from": {
                              "key_code": "f1"
                          },
                          "to": [
                              {
                                  "consumer_key_code": "display_brightness_decrement"
                              }
                          ]
                      },
                      {
                          "from": {
                              "key_code": "f2"
                          },
                          "to": [
                              {
                                  "consumer_key_code": "display_brightness_increment"
                              }
                          ]
                      },
                      {
                          "from": {
                              "key_code": "f3"
                          },
                          "to": [
                              {
                                  "apple_vendor_keyboard_key_code": "mission_control"
                              }
                          ]
                      },
                      {
                          "from": {
                              "key_code": "f4"
                          },
                          "to": [
                              {
                                  "apple_vendor_keyboard_key_code": "spotlight"
                              }
                          ]
                      },
                      {
                          "from": {
                              "key_code": "f5"
                          },
                          "to": [
                              {
                                  "consumer_key_code": "dictation"
                              }
                          ]
                      },
                      {
                          "from": {
                              "key_code": "f6"
                          },
                          "to": [
                              {
                                  "key_code": "f6"
                              }
                          ]
                      },
                      {
                          "from": {
                              "key_code": "f7"
                          },
                          "to": [
                              {
                                  "consumer_key_code": "rewind"
                              }
                          ]
                      },
                      {
                          "from": {
                              "key_code": "f8"
                          },
                          "to": [
                              {
                                  "consumer_key_code": "play_or_pause"
                              }
                          ]
                      },
                      {
                          "from": {
                              "key_code": "f9"
                          },
                          "to": [
                              {
                                  "consumer_key_code": "fast_forward"
                              }
                          ]
                      },
                      {
                          "from": {
                              "key_code": "f10"
                          },
                          "to": [
                              {
                                  "consumer_key_code": "mute"
                              }
                          ]
                      },
                      {
                          "from": {
                              "key_code": "f11"
                          },
                          "to": [
                              {
                                  "consumer_key_code": "volume_decrement"
                              }
                          ]
                      },
                      {
                          "from": {
                              "key_code": "f12"
                          },
                          "to": [
                              {
                                  "consumer_key_code": "volume_increment"
                              }
                          ]
                      }
                  ],
                  "name": "Bitwig",
                  "parameters": {
                      "delay_milliseconds_before_open_device": 1000
                  },
                  "selected": false,
                  "simple_modifications": [],
                  "virtual_hid_keyboard": {
                      "country_code": 0,
                      "indicate_sticky_modifier_keys_state": true,
                      "mouse_key_xy_scale": 100
                  }
              }
          ]
      }
    '';
  };

  programs.zellij = {
    enable = true;
  };
  home.file.zellij_hx_layout = {
    target = ".config/zellij/layouts/hx.kdl";
    text = ''
      layout {
        	default_tab_template {
                pane size=1 borderless=true {
                    plugin location="zellij:tab-bar"
                }
                children
                pane size=2 borderless=true {
                    plugin location="zellij:status-bar"
                }
            }

            tab name="Main" focus=true {
        	    pane {
        	        // value omitted, will be layed out horizontally
        	        pane command="hx"
        	        pane size="10%"
        	    }
        	}

            tab name="Yazi" {
                pane command="yazi"
            }
       }
    '';
  };
  home.file.zellij_config = {
    target = ".config/zellij/config.kdl";
    text = ''
      // If you'd like to override the default keybindings completely, be sure to change "keybinds" to "keybinds clear-defaults=true"
      keybinds {
          normal {
              // uncomment this and adjust key if using copy_on_select=false
              // bind "Alt c" { Copy; }
          }
          locked {
              bind "Ctrl g" { SwitchToMode "Normal"; }
          }
          resize {
              bind "Ctrl n" { SwitchToMode "Normal"; }
              bind "h" "Left" { Resize "Increase Left"; }
              bind "j" "Down" { Resize "Increase Down"; }
              bind "k" "Up" { Resize "Increase Up"; }
              bind "l" "Right" { Resize "Increase Right"; }
              bind "H" { Resize "Decrease Left"; }
              bind "J" { Resize "Decrease Down"; }
              bind "K" { Resize "Decrease Up"; }
              bind "L" { Resize "Decrease Right"; }
              bind "=" "+" { Resize "Increase"; }
              bind "-" { Resize "Decrease"; }
          }
          pane {
              bind "Ctrl p" { SwitchToMode "Normal"; }
              bind "h" "Left" { MoveFocus "Left"; }
              bind "l" "Right" { MoveFocus "Right"; }
              bind "j" "Down" { MoveFocus "Down"; }
              bind "k" "Up" { MoveFocus "Up"; }
              bind "p" { SwitchFocus; }
              bind "n" { NewPane; SwitchToMode "Normal"; }
              bind "d" { NewPane "Down"; SwitchToMode "Normal"; }
              bind "r" { NewPane "Right"; SwitchToMode "Normal"; }
              bind "x" { CloseFocus; SwitchToMode "Normal"; }
              bind "f" { ToggleFocusFullscreen; SwitchToMode "Normal"; }
              bind "z" { TogglePaneFrames; SwitchToMode "Normal"; }
              bind "w" { ToggleFloatingPanes; SwitchToMode "Normal"; }
              bind "e" { TogglePaneEmbedOrFloating; SwitchToMode "Normal"; }
              bind "c" { SwitchToMode "RenamePane"; PaneNameInput 0;}
          }
          move {
              bind "Ctrl h" { SwitchToMode "Normal"; }
              bind "n" "Tab" { MovePane; }
              bind "p" { MovePaneBackwards; }
              bind "h" "Left" { MovePane "Left"; }
              bind "j" "Down" { MovePane "Down"; }
              bind "k" "Up" { MovePane "Up"; }
              bind "l" "Right" { MovePane "Right"; }
          }
          tab {
              bind "Ctrl t" { SwitchToMode "Normal"; }
              bind "r" { SwitchToMode "RenameTab"; TabNameInput 0; }
              bind "h" "Left" "Up" "k" { GoToPreviousTab; }
              bind "l" "Right" "Down" "j" { GoToNextTab; }
              bind "n" { NewTab; SwitchToMode "Normal"; }
              bind "x" { CloseTab; SwitchToMode "Normal"; }
              bind "s" { ToggleActiveSyncTab; SwitchToMode "Normal"; }
              bind "1" { GoToTab 1; SwitchToMode "Normal"; }
              bind "2" { GoToTab 2; SwitchToMode "Normal"; }
              bind "3" { GoToTab 3; SwitchToMode "Normal"; }
              bind "4" { GoToTab 4; SwitchToMode "Normal"; }
              bind "5" { GoToTab 5; SwitchToMode "Normal"; }
              bind "6" { GoToTab 6; SwitchToMode "Normal"; }
              bind "7" { GoToTab 7; SwitchToMode "Normal"; }
              bind "8" { GoToTab 8; SwitchToMode "Normal"; }
              bind "9" { GoToTab 9; SwitchToMode "Normal"; }
              bind "Tab" { ToggleTab; }
          }
          scroll {
              bind "Ctrl s" { SwitchToMode "Normal"; }
              bind "e" { EditScrollback; SwitchToMode "Normal"; }
              bind "s" { SwitchToMode "EnterSearch"; SearchInput 0; }
              bind "Ctrl c" { ScrollToBottom; SwitchToMode "Normal"; }
              bind "j" "Down" { ScrollDown; }
              bind "k" "Up" { ScrollUp; }
              bind "Ctrl f" "PageDown" "Right" "l" { PageScrollDown; }
              bind "Ctrl b" "PageUp" "Left" "h" { PageScrollUp; }
              bind "d" { HalfPageScrollDown; }
              bind "u" { HalfPageScrollUp; }
              // uncomment this and adjust key if using copy_on_select=false
              // bind "Alt c" { Copy; }
          }
          search {
              bind "Ctrl s" { SwitchToMode "Normal"; }
              bind "Ctrl c" { ScrollToBottom; SwitchToMode "Normal"; }
              bind "j" "Down" { ScrollDown; }
              bind "k" "Up" { ScrollUp; }
              bind "Ctrl f" "PageDown" "Right" "l" { PageScrollDown; }
              bind "Ctrl b" "PageUp" "Left" "h" { PageScrollUp; }
              bind "d" { HalfPageScrollDown; }
              bind "u" { HalfPageScrollUp; }
              bind "n" { Search "down"; }
              bind "p" { Search "up"; }
              bind "c" { SearchToggleOption "CaseSensitivity"; }
              bind "w" { SearchToggleOption "Wrap"; }
              bind "o" { SearchToggleOption "WholeWord"; }
          }
          entersearch {
              bind "Ctrl c" "Esc" { SwitchToMode "Scroll"; }
              bind "Enter" { SwitchToMode "Search"; }
          }
          renametab {
              bind "Ctrl c" { SwitchToMode "Normal"; }
              bind "Esc" { UndoRenameTab; SwitchToMode "Tab"; }
          }
          renamepane {
              bind "Ctrl c" { SwitchToMode "Normal"; }
              bind "Esc" { UndoRenamePane; SwitchToMode "Pane"; }
          }
          session {
              bind "Ctrl o" { SwitchToMode "Normal"; }
              bind "Ctrl s" { SwitchToMode "Scroll"; }
              bind "d" { Detach; }
          }
          tmux {
              bind "[" { SwitchToMode "Scroll"; }
              bind "Ctrl b" { Write 2; SwitchToMode "Normal"; }
              bind "\"" { NewPane "Down"; SwitchToMode "Normal"; }
              bind "%" { NewPane "Right"; SwitchToMode "Normal"; }
              bind "z" { ToggleFocusFullscreen; SwitchToMode "Normal"; }
              bind "c" { NewTab; SwitchToMode "Normal"; }
              bind "," { SwitchToMode "RenameTab"; }
              bind "p" { GoToPreviousTab; SwitchToMode "Normal"; }
              bind "n" { GoToNextTab; SwitchToMode "Normal"; }
              bind "Left" { MoveFocus "Left"; SwitchToMode "Normal"; }
              bind "Right" { MoveFocus "Right"; SwitchToMode "Normal"; }
              bind "Down" { MoveFocus "Down"; SwitchToMode "Normal"; }
              bind "Up" { MoveFocus "Up"; SwitchToMode "Normal"; }
              bind "h" { MoveFocus "Left"; SwitchToMode "Normal"; }
              bind "l" { MoveFocus "Right"; SwitchToMode "Normal"; }
              bind "j" { MoveFocus "Down"; SwitchToMode "Normal"; }
              bind "k" { MoveFocus "Up"; SwitchToMode "Normal"; }
              bind "o" { FocusNextPane; }
              bind "d" { Detach; }
              bind "Space" { NextSwapLayout; }
              bind "x" { CloseFocus; SwitchToMode "Normal"; }
          }
          shared_except "locked" {
              bind "Ctrl g" { SwitchToMode "Locked"; }
              bind "Ctrl q" { Quit; }
          }
          shared_among "locked" {
              bind "Alt h" "Alt Left" { MoveFocusOrTab "Left"; }
              bind "Alt l" "Alt Right" { MoveFocusOrTab "Right"; }
              bind "Alt j" "Alt Down" { MoveFocus "Down"; }
              bind "Alt k" "Alt Up" { MoveFocus "Up"; }
              bind "Alt =" "Alt +" { Resize "Increase"; }
              bind "Alt -" { Resize "Decrease"; }
              bind "Alt [" { PreviousSwapLayout; }
              bind "Alt ]" { NextSwapLayout; }
              bind "Alt n" { NewPane; }
          }
          shared_except "normal" "locked" {
              bind "Enter" "Esc" { SwitchToMode "Normal"; }
          }
          shared_except "pane" "locked" {
              bind "Ctrl p" { SwitchToMode "Pane"; }
          }
          shared_except "resize" "locked" {
              bind "Ctrl n" { SwitchToMode "Resize"; }
          }
          shared_except "scroll" "locked" {
              bind "Ctrl s" { SwitchToMode "Scroll"; }
          }
          shared_except "session" "locked" {
              bind "Ctrl o" { SwitchToMode "Session"; }
          }
          shared_except "tab" "locked" {
              bind "Ctrl t" { SwitchToMode "Tab"; }
          }
          shared_except "move" "locked" {
              bind "Ctrl h" { SwitchToMode "Move"; }
          }
          shared_except "tmux" "locked" {
              bind "Ctrl b" { SwitchToMode "Tmux"; }
          }
      }

      plugins {
          tab-bar { path "tab-bar"; }
          status-bar { path "status-bar"; }
          strider { path "strider"; }
          compact-bar { path "compact-bar"; }
      }

      // Choose what to do when zellij receives SIGTERM, SIGINT, SIGQUIT or SIGHUP
      // eg. when terminal window with an active zellij session is closed
      // Options:
      //   - detach (Default)
      //   - quit
      //
      on_force_close "detach"

      //  Send a request for a simplified ui (without arrow fonts) to plugins
      //  Options:
      //    - true
      //    - false (Default)
      //
      // simplified_ui true

      // Choose the path to the default shell that zellij will use for opening new panes
      // Default: $SHELL
      //
      default_shell "fish"

      // Choose the path to override cwd that zellij will use for opening new panes
      //
      // default_cwd ""

      // Toggle between having pane frames around the panes
      // Options:
      //   - true (default)
      //   - false
      //
      // pane_frames true

      // Toggle between having Zellij lay out panes according to a predefined set of layouts whenever possible
      // Options:
      //   - true (default)
      //   - false
      //
      // auto_layout true

      // Define color themes for Zellij
      // For more examples, see: https://github.com/zellij-org/zellij/tree/main/example/themes
      // Once these themes are defined, one of them should to be selected in the "theme" section of this file
      //
      // themes {
      //     dracula {
      //         bg 40 42 54
      //         fg 248 248 242
      //         red 255 85 85
      //         green 80 250 123
      //         yellow 241 250 140
      //         blue 98 114 164
      //         magenta 255 121 198
      //         orange 255 184 108
      //         cyan 139 233 253
      //         black 0 0 0
      //         white 255 255 255
      //     }
      // }

      // Choose the theme that is specified in the themes section.
      // Default: default
      //
      theme "catppuccin-mocha"

      // The name of the default layout to load on startup
      // Default: "default"
      //
      // default_layout "compact"

      // Choose the mode that zellij uses when starting up.
      // Default: normal
      //
      default_mode "locked"

      // Toggle enabling the mouse mode.
      // On certain configurations, or terminals this could
      // potentially interfere with copying text.
      // Options:
      //   - true (default)
      //   - false
      //
      // mouse_mode false

      // Configure the scroll back buffer size
      // This is the number of lines zellij stores for each pane in the scroll back
      // buffer. Excess number of lines are discarded in a FIFO fashion.
      // Valid values: positive integers
      // Default value: 10000
      //
      // scroll_buffer_size 10000

      // Provide a command to execute when copying text. The text will be piped to
      // the stdin of the program to perform the copy. This can be used with
      // terminal emulators which do not support the OSC 52 ANSI control sequence
      // that will be used by default if this option is not set.
      // Examples:
      //
      // copy_command "xclip -selection clipboard" // x11
      // copy_command "wl-copy"                    // wayland
      // copy_command "pbcopy"                     // osx

      // Choose the destination for copied text
      // Allows using the primary selection buffer (on x11/wayland) instead of the system clipboard.
      // Does not apply when using copy_command.
      // Options:
      //   - system (default)
      //   - primary
      //
      // copy_clipboard "primary"

      // Enable or disable automatic copy (and clear) of selection when releasing mouse
      // Default: true
      //
      // copy_on_select false

      // Path to the default editor to use to edit pane scrollbuffer
      // Default: $EDITOR or $VISUAL
      //
      scrollback_editor "/opt/homebrew/bin/hx"

      // When attaching to an existing session with other users,
      // should the session be mirrored (true)
      // or should each user have their own cursor (false)
      // Default: false
      //
      // mirror_session true

      // The folder in which Zellij will look for layouts
      //
      // layout_dir "~/.config/zellij/layouts"

      // The folder in which Zellij will look for themes
      //
      // theme_dir "/path/to/my/theme_dir"

      ui {
          pane_frames {
              rounded_corners true
              // hide_session_name true
          }
      }
    '';
  };

  programs.eza = {
    enable = true;
    git = true;
    icons = true;
  };

  programs.git = {
    enable = true;
    lfs.enable = true;

    userName = "Ivan Miles Piesh";
    userEmail = "ipiesh@skysound.com";

    # includes = [
    #   {
    #     # use diffrent email & name for work
    #     path = "~/work/.gitconfig";
    #     condition = "gitdir:~/work/";
    #   }
    # ];

    extraConfig = {
      init.defaultBranch = "main";
      push.autoSetupRemote = true;
      pull.rebase = true;
    };

    # signing = {
    #   key = "xxx";
    #   signByDefault = true;
    # };

    delta = {
      enable = true;
      options = {
        features = "side-by-side";
      };
    };

    aliases = {
      # common aliases
      br = "branch";
      co = "checkout";
      st = "status";
      ls = "log --pretty=format:\"%C(yellow)%h%Cred%d\\\\ %Creset%s%Cblue\\\\ [%cn]\" --decorate";
      ll = "log --pretty=format:\"%C(yellow)%h%Cred%d\\\\ %Creset%s%Cblue\\\\ [%cn]\" --decorate --numstat";
      cm = "commit -m";
      ca = "commit -am";
      dc = "diff --cached";
      amend = "commit --amend -m";

      # aliases for submodule
      update = "submodule update --init --recursive";
      foreach = "submodule foreach";
    };
  };

  programs.helix = {
    enable = true;
    defaultEditor = true;
    extraPackages = [
      pkgs.marksman
      pkgs.taplo
      pkgs.typos-lsp
      pkgs.nil
      pkgs.vscode-langservers-extracted
      pkgs.nixpkgs-fmt
      pkgs.yaml-language-server
    ];
    settings = {
      theme = "catppuccin_mocha";
      ###############################################################################################
      # EDITOR
      ###############################################################################################
      editor = {
        true-color = true;
        cursorline = true;
        color-modes = true;
        bufferline = "multiple";
        scrolloff = 10;
        gutters = ["diagnostics" "spacer" "line-numbers" "spacer" "diff"];
      };
      editor.whitespace.characters = {
        space = "·";
        nbsp = "⍽";
        nnbsp = "␣";
        tab = "→";
        newline = "⏎";
        tabpad = "·"; # Tabs will look like "→···" (depending on tab width)
      };
      editor.file-picker = {
        hidden = false;
      };
      editor.cursor-shape = {
        insert = "bar";
        normal = "block";
        select = "underline";
      };
      editor.lsp = {
        display-messages = true;
      };
      editor.statusline = {
        left = [
          "mode"
          "spacer"
          "version-control"
          "spacer"
          "separator"
          "file-name"
          "file-modification-indicator"
        ];
        right = [
          "spinner"
          "spacer"
          "workspace-diagnostics"
          "separator"
          "spacer"
          "diagnostics"
          "position"
          "primary-selection-length"
          "file-encoding"
          "file-line-ending"
          "file-type"
        ];
        separator = "│";
        mode.normal = "NORMAL";
        mode.insert = "INSERT";
        mode.select = "SELECT";
      };
      editor.indent-guides = {
        render = true;
        character = "|";
        skip-levels = 1;
      };
      editor.soft-wrap = {
        enable = true;
        max-wrap = 25; # increase value to reduce forced mid-word wrapping
        max-indent-retain = 0;
      };
      ##############################################################################################3
      # KEYS
      ##############################################################################################3
      keys.normal = {
        C-j = ["extend_to_line_bounds" "delete_selection" "paste_after"];
        C-k = ["extend_to_line_bounds" "delete_selection" "move_line_up" "paste_before"];
        esc = ["collapse_selection" "keep_primary_selection"];
        up = "no_op";
        down = "no_op";
        left = "no_op";
        right = "no_op";
        pageup = "no_op";
        pagedown = "no_op";
        home = "no_op";
        end = "no_op";
        "A-," = "goto_previous_buffer";
        "A-." = "goto_next_buffer";
        "A-w" = ":buffer-close";
        "A-/" = "repeat_last_motion";
        X = ["extend_line_up" "extend_to_line_bounds"];
      };
      keys.select = {
        C-c = "toggle_comments";
        up = "no_op";
        down = "no_op";
        left = "no_op";
        right = "no_op";
        pageup = "no_op";
        pagedown = "no_op";
        home = "no_op";
        X = ["extend_line_up" "extend_to_line_bounds"];
        end = "no_op";
      };
      keys.insert = {
        C-c = "toggle_comments";
        C-space = "completion";
        up = "no_op";
        down = "no_op";
        left = "no_op";
        right = "no_op";
        pageup = "no_op";
        pagedown = "no_op";
        home = "no_op";
        end = "no_op";
      };
      keys.normal.space.c = {
        r = [":w" ":config-reload"];
        o = ":config-open";
        l = ":o ~/.config/helix/languages.toml";
      };
      keys.normal.space.o = {
        g = ":sh zellij run -fc --height 100% --width 100% -x 0 -y 0 -- lazygit";
        f = ":sh zellij run -fc -- yazi";
        m = ":sh zellij run -fc -- glow -p ./README.md";
        r = ":set whitespace.render none";
        w = ":set whitespace.render all";
      };
      keys.normal.space.a = {
        g = [":sh go mod tidy" ":reload-all" ":lsp-restart"];
        r = [":reload-all" ":lsp-restart"];
        l = ":sh zellij run -d right -- revive -formatter stylish ./...";
      };
      keys.normal.space = {
        W = ":write";
      };
    };
    languages = {
      language = [
        # SCLS STUB ###########################################
        {
          name = "stub";
          scope = "text.stub";
          file-types = [];
          shebangs = [];
          roots = [];
          auto-format = false;
          language-servers = ["scls"];
        }
        # GOLANG ###########################################
        {
          name = "go";
          auto-format = true;
          formatter.command = "goimports";
          language-servers = ["gopls" "typos" "scls"];
        }
        # RUST ###########################################
        {
          name = "rust";
        }
        # SQL ###########################################
        {
          name = "sql";
          language-servers = ["sql-langauge-server" "typos"];
        }
        # DOCKERFILE ####################################
        {
          name = "dockerfile";
          file-types = ["Dockerfile"];
          auto-format = true;
        }
        # NIX ####################################
        {
          name = "nix";
          formatter.command = "nixpkgs-fmt";
        }
        # MARKDOWN ####################################
        {
          name = "markdown";
          language-servers = ["markdown-oxide"];
        }
      ];
      # LANGUAGE SERVERS ################################
      # TYPOS ###########################################
      language-server.typos = {
        command = "typos-lsp";
      };
      # SIMPLE COMPLETION LANG SERVER ###################
      language-server.scls = {
        command = "simple-completion-language-server";
        config = {
          max_completion_items = 20; # set max completion results len for each group: words, snippets, unicode-input
          snippets_first = true; # completions will return before snippets by default
          feature_words = true; # enable completion by word
          feature_snippets = true; # enable snippets
          feature_unicode_input = true; # enable "unicode input"
          feature_paths = true; # enable path completion
        };
        environment = {
          # write logs to /tmp/completion.log
          RUST_LOG = "info,simple-completion-langauge-server=info";
          LOG_FILE = "/tmp/completion.log";
        };
      };
      # RUST LANG SERVER ####################################
      language-server.rust-analyzer.config.check = {
        command = "clippy";
      };
      # YAML LANG SERVER ####################################
      language-server.yaml-language-server = {
        config.yaml = {
          format.enable = true;
          validation = true;
          schema = {
            "https://taskfile.dev/schema.json" = "**/Taskfile.yml";
          };
        };
      };
    };
  };

  programs.wezterm = {
    enable = true;
    extraConfig = ''
      -- Pull in the wezterm API
      local wezterm = require 'wezterm'

      -- This table will hold the configuration.
      local config = {}

      local mux = wezterm.mux
      local act = wezterm.action wezterm.on('gui-startup', function()
        local tab, pane, window = mux.spawn_window({})
        window:gui_window():maximize()
      end)

      if wezterm.config_builder then
        config = wezterm.config_builder()
      end

      -- This is where you actually apply your config choices
      config.color_scheme = 'Catppuccin Mocha'
      config.font = wezterm.font 'MesloLGSDZ Nerd Font Mono'
      config.font_size = 13
      config.window_decorations = "RESIZE"
      config.hide_tab_bar_if_only_one_tab = true
      config.window_frame = {
        font = wezterm.font { family = 'MesloLGSDZ Nerd Font Mono', weight = 'Regular' },
      }
      config.term = "wezterm"

      config.keys = {
        {
          -- disable this because I constantly fat finger
          -- tab and caps lock (CTRL) at the same time
          key = 'Tab',
          mods = 'CTRL',
          action = wezterm.action.DisableDefaultAssignment,
        },
      }

      -- and finally, return the configuration to wezterm
      return config
    '';
  };

  programs.fish = {
    enable = true;
    interactiveShellInit = ''
      set fish_greeting # Disable greeting
      export EDITOR="hx"
      export GOPRIVATE="gitlab.disney.com/skywalker-sound/*,gitlab.disney.com/skywalker-sound/libraries/golang/*"

      alias config='/usr/bin/git --git-dir=/Users/ipiesh/.cfg/.git/ --work-tree=/Users/ipiesh'

      fish_add_path "/opt/homebrew/bin/"

      ##Keep this at the end
      fzf --fish | source
      zoxide init fish | source
    '';
    shellAliases = {
      "ls" = "eza -lAF";
      mkdir = "mkdir -p";
      ".." = "cd ..";
      "..." = "cd ../..";
    };
    shellAbbrs = {
      g = "git";
      m = "make";
      t = "task";
      lg = "lazygit";
      zj = "zellij -l welcome";
    };
    plugins = [
      {
        name = "grc";
        src = pkgs.fishPlugins.grc.src;
      }
      {
        name = "tide";
        src = pkgs.fishPlugins.tide.src;
      }
      {
        name = "fzf";
        src = pkgs.fishPlugins.fzf-fish.src;
      }
      {
        name = "bass";
        src = pkgs.fishPlugins.bass.src;
      }
      # Manual packaging and enable a plugin
      # {
      #   name = "z";
      #   src = pkgs.fetchFromGitHub {
      #     owner = "jethrokuan";
      #     repo = "z";
      #     rev = "e0e1b9dfdba362f8ab1ae8c1afc7ccf62b89f7eb";
      #     sha256 = "0dbnir6jbwjpjalz14snzd3cgdysgcs3raznsijd6savad3qhijc";
      #   };
      # }
    ];
  };
}
