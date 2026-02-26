-- Pull in the wezterm API
local wezterm = require 'wezterm'

-- This table will hold the configuration.
local config = {}

local mux = wezterm.mux
local act = wezterm.action

wezterm.on('gui-startup', function()
 local tab, pane, window = mux.spawn_window({})
 window:gui_window():maximize()
end)

if wezterm.config_builder then
  config = wezterm.config_builder()
end

-- This is where you actually apply your config choices
config.color_scheme = 'Catppuccin Mocha'
config.font = wezterm.font('FiraCode Nerd Font Mono', { weight = 'Regular', italic = false })
config.font_size = 13
config.window_decorations = "RESIZE"
config.hide_tab_bar_if_only_one_tab = true
config.window_frame = {
 font = wezterm.font { family = 'FiraCode Nerd Font Mono', weight = 'Regular' },
}
config.term = "xterm-256color"

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
