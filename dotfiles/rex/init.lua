-- Zellij-inspired bindings. Modes are entered with a key, then act on the next key.
-- Escape leaves any mode.

-- Focus movement that keeps a zoomed window zoomed: if the active window has a
-- zoomed block, move focus, then zoom the newly focused block.
local function active_window_zoomed()
  local view = rex.session.view{}
  if view == nil then return false end
  for _, w in ipairs(view.windows or {}) do
    if w.window_id == view.active_window_id then
      return w.zoomed_block_id ~= nil
    end
  end
  return false
end

rex.action{
  name = "focus_keep_zoom",
  title = "Focus Pane (Keep Zoom)",
  args = { direction = "string" },
  run = function(ctx, args)
    local zoomed = active_window_zoomed()
    local _, err
    if args.direction == "previous" then
      _, err = rex.session.focus_previous_pane{ wrap = true }
    else
      _, err = rex.session.focus_direction{ direction = args.direction }
    end
    if err ~= nil then error(err, 0) end
    if zoomed then rex.session.zoom_block{ zoom = true } end
  end,
}

-- Shared (no mode): Alt-based bindings
rex.bind("alt+n", "session.new")
rex.bind("alt+h", "focus_keep_zoom", { direction = "left" })
rex.bind("alt+j", "focus_keep_zoom", { direction = "down" })
rex.bind("alt+k", "focus_keep_zoom", { direction = "up" })
rex.bind("alt+l", "focus_keep_zoom", { direction = "right" })
rex.bind("alt+-", "pane.split", { direction = "down" })  -- horizontal split (stacked)
rex.bind("alt+v", "pane.split", { direction = "right" }) -- vertical split (side by side)

-- Option+1..9: switch to session N (Command+1..9 still switches tabs)
rex.action{
  name = "goto_session",
  title = "Go to Session by Number",
  args = { index = "integer" },
  run = function(ctx, args)
    local res, err = rex.call("session.list")
    if err ~= nil then error(err, 0) end
    local s = res.sessions[args.index]
    if s == nil then error("no session " .. args.index, 0) end
    rex.client.queue("session.select", { session_id = s.session_id })
  end,
}
for i = 1, 9 do
  rex.bind("alt+" .. i, "goto_session", { index = i })
end

rex.bind("alt+[", "client.tab.previous")
rex.bind("alt+]", "client.tab.next")
rex.bind("alt+o", "client.tab.move.forward")
rex.bind("alt+f", "pane.zoom")

-- Pane mode (Alt+P)
rex.bind("alt+p", "client.mode.enter", { name = "pane" })
rex.bind("pane/h", "focus_keep_zoom", { direction = "left" })
rex.bind("pane/j", "focus_keep_zoom", { direction = "down" })
rex.bind("pane/k", "focus_keep_zoom", { direction = "up" })
rex.bind("pane/l", "focus_keep_zoom", { direction = "right" })
rex.bind("pane/left", "focus_keep_zoom", { direction = "left" })
rex.bind("pane/down", "focus_keep_zoom", { direction = "down" })
rex.bind("pane/up", "focus_keep_zoom", { direction = "up" })
rex.bind("pane/right", "focus_keep_zoom", { direction = "right" })
rex.bind("pane/n", "pane.split", { direction = "right" })
rex.bind("pane/d", "pane.split", { direction = "down" })
rex.bind("pane/x", "pane.close")
rex.bind("pane/f", "pane.zoom")
rex.bind("pane/w", "client.sidebar.toggle")
rex.bind("pane/p", "focus_keep_zoom", { direction = "previous" })

-- Tab mode (Ctrl+T)
rex.bind("ctrl+t", "client.mode.enter", { name = "tab" })
rex.bind("tab/h", "client.tab.previous")
rex.bind("tab/k", "client.tab.previous")
rex.bind("tab/l", "client.tab.next")
rex.bind("tab/j", "client.tab.next")
rex.bind("tab/left", "client.tab.previous")
rex.bind("tab/right", "client.tab.next")
rex.bind("tab/n", "client.tab.new")
rex.bind("tab/x", "client.tab.close")
rex.bind("tab/r", "client.tab.rename")
rex.bind("tab/1", "client.tab.goto", { index = 1 })
rex.bind("tab/2", "client.tab.goto", { index = 2 })
rex.bind("tab/3", "client.tab.goto", { index = 3 })
rex.bind("tab/4", "client.tab.goto", { index = 4 })
rex.bind("tab/5", "client.tab.goto", { index = 5 })
rex.bind("tab/6", "client.tab.goto", { index = 6 })
rex.bind("tab/7", "client.tab.goto", { index = 7 })
rex.bind("tab/8", "client.tab.goto", { index = 8 })
rex.bind("tab/9", "client.tab.goto", { index = 9 })

-- Resize mode (Alt+R)
rex.bind("alt+r", "client.mode.enter", { name = "resize" })
rex.bind("resize/h", "pane.resize", { direction = "left" })
rex.bind("resize/j", "pane.resize", { direction = "down" })
rex.bind("resize/k", "pane.resize", { direction = "up" })
rex.bind("resize/l", "pane.resize", { direction = "right" })
rex.bind("resize/left", "pane.resize", { direction = "left" })
rex.bind("resize/down", "pane.resize", { direction = "down" })
rex.bind("resize/up", "pane.resize", { direction = "up" })
rex.bind("resize/right", "pane.resize", { direction = "right" })
rex.bind("resize/=", "pane.balance")

-- Move mode (Ctrl+H): move the focused pane
rex.bind("ctrl+h", "client.mode.enter", { name = "move" })
rex.bind("move/h", "pane.move", { direction = "left" })
rex.bind("move/j", "pane.move", { direction = "down" })
rex.bind("move/k", "pane.move", { direction = "up" })
rex.bind("move/l", "pane.move", { direction = "right" })
rex.bind("move/n", "pane.move_to_new_tab")

-- Session mode (Ctrl+O)
rex.bind("ctrl+o", "client.mode.enter", { name = "session" })
rex.bind("session/w", "session.switch")
rex.bind("session/n", "session.new")
rex.bind("session/r", "session.rename")
rex.bind("session/d", "session.close")

-- Scroll/search (Ctrl+S): find in scrollback
rex.bind("ctrl+s", "client.mode.enter", { name = "scroll" })
rex.bind("scroll/s", "client.find.open")
rex.bind("scroll/n", "client.find.next")
rex.bind("scroll/p", "client.find.previous")
rex.bind("scroll/k", "client.prompt.previous")
rex.bind("scroll/j", "client.prompt.next")

-- Use Ctrl+G to leave everything, like zellij's locked mode toggle
rex.bind("ctrl+g", "client.mode.exit_all")
