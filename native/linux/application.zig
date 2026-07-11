const model=@import("model");const workspace=@import("workspace_view");
pub const Action=enum{new_shell,launch_command,activate_command,select_tab,next_tab,previous_tab,reorder_tab,rename_tab,close_tab,remove_tab,relaunch_tab,focus_attention,open_vscode,pin_workspace,unpin_workspace,reorder_pin};
pub const ActionSpec=struct{name:[]const u8,accelerator:?[]const u8,requires_ready:bool};
pub const actions=[_]ActionSpec{.{.name="win.new-shell",.accelerator="<Primary><Shift>t",.requires_ready=true},.{.name="win.launch-command",.accelerator="<Primary><Shift>p",.requires_ready=true},.{.name="win.activate-command",.accelerator=null,.requires_ready=true},.{.name="win.select-tab",.accelerator=null,.requires_ready=false},.{.name="win.next-tab",.accelerator="<Primary>Page_Down",.requires_ready=false},.{.name="win.previous-tab",.accelerator="<Primary>Page_Up",.requires_ready=false},.{.name="win.reorder-tab",.accelerator=null,.requires_ready=false},.{.name="win.rename-tab",.accelerator=null,.requires_ready=false},.{.name="win.close-tab",.accelerator="<Primary><Shift>w",.requires_ready=false},.{.name="win.remove-tab",.accelerator=null,.requires_ready=false},.{.name="win.relaunch-tab",.accelerator=null,.requires_ready=true},.{.name="win.focus-attention",.accelerator=null,.requires_ready=false},.{.name="win.open-vscode",.accelerator=null,.requires_ready=true},.{.name="win.pin-workspace",.accelerator=null,.requires_ready=false},.{.name="win.unpin-workspace",.accelerator=null,.requires_ready=false},.{.name="win.reorder-pin",.accelerator=null,.requires_ready=false}};
pub fn enabled(state:*const model.State,spec:ActionSpec)bool{return !spec.requires_ready or state.connection==.ready;}
pub fn page(state:*model.State)workspace.Page{return (workspace.View{.state=state}).page();}
pub const Breakpoint=struct{sidebar_collapsed_below:i32=720,wide_content_above:i32=1080};
pub const IntegrationInvocation=struct{argv:[5][]const u8,len:usize};
pub fn vscodeInvocation(state:*const model.State,pair:model.PairKey,executable:[]const u8)!IntegrationInvocation{
    for(state.workspaces[0..state.workspace_count])|*ws|if(model.PairKey.eql(.{.workspace_id=ws.id,.repository_id=pair.repository_id},pair)){
        if(ws.name_len==0)return error.MissingWorkspaceName;
        return .{.argv=.{executable,"integration","vscode","open",ws.name[0..ws.name_len]},.len=5};
    };
    return error.UnknownWorkspace;
}
