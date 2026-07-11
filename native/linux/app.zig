const adapter = @import("adapter");
const host = @import("terminal_host");
const ownership = @import("ownership");

/// Minimal single-window shell composition point. Toolkit-specific handles are
/// intentionally introduced only by the eventual executable wrapper.
pub fn createTerminalHost(terminal: *adapter.Adapter, owner: ownership.Owner) host.TerminalHost {
    return host.TerminalHost.init(terminal, owner);
}
