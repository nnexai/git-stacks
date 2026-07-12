const std=@import("std"); const model=@import("model");
pub const RecentLimit=10;
pub const EmptyState=enum{none,no_configured_commands,no_matches};
pub const Item=struct{command_index:usize,scope:enum{workspace,repository},duplicate_name:bool};
pub const Launcher=struct{state:*const model.State,pair:model.PairKey,recents:[RecentLimit][64]u8=undefined,recent_lens:[RecentLimit]u8=[_]u8{0}**RecentLimit,recent_count:u8=0,open:bool=false,error_message:[192]u8=[_]u8{0}**192,error_len:u8=0,restore_surface:?model.Id=null,selected_id:[64]u8=[_]u8{0}**64,selected_len:u8=0,
pub fn canLaunch(self:*const Launcher)bool{return self.state.connection==.ready;}
fn valid(self:*const Launcher,c:model.Command)bool{return std.mem.eql(u8,&c.workspace_id,&self.pair.workspace_id) and (c.repository_id==null or std.mem.eql(u8,&c.repository_id.?,&self.pair.repository_id));}
pub fn collect(self:*const Launcher,query:[]const u8,out:[]Item)usize{var n:usize=0;for(self.recents[0..self.recent_count],self.recent_lens[0..self.recent_count])|id,len| { for(self.state.commands[0..self.state.command_count],0..)|c,i| { if(self.valid(c) and std.mem.eql(u8,id[0..len],c.id[0..c.id_len]) and match(c.name[0..c.name_len],query)){if(n<out.len){out[n]=self.item(i);n+=1;}} } } const recent_end=n;for(self.state.commands[0..self.state.command_count],0..)|c,i|{if(!self.valid(c) or !match(c.name[0..c.name_len],query) or self.isRecent(c.id[0..c.id_len]))continue;if(n<out.len){out[n]=self.item(i);n+=1;}}std.mem.sort(Item,out[recent_end..n],self.state,less);return n;}
pub fn emptyState(self:*const Launcher,query:[]const u8,count:usize)EmptyState{if(count>0)return .none;for(self.state.commands[0..self.state.command_count])|c|if(self.valid(c))return if(query.len>0).no_matches else .no_configured_commands;return .no_configured_commands;}
pub fn selectAfterRefresh(self:*Launcher,items:[]const Item)usize{
    if(items.len==0){self.selected_len=0;return 0;}
    if(self.selected_len>0){
        for(items,0..)|candidate,i|{
            const command=self.state.commands[candidate.command_index];
            if(std.mem.eql(u8,self.selected_id[0..self.selected_len],command.id[0..command.id_len]))return i;
        }
    }
    self.rememberSelection(items[0]);return 0;
}
pub fn moveSelection(self:*Launcher,items:[]const Item,current:usize,delta:i8)usize{if(items.len==0)return 0;const next=if(delta>0)(current+1)%items.len else if(current==0)items.len-1 else current-1;self.rememberSelection(items[next]);return next;}
fn rememberSelection(self:*Launcher,candidate:Item)void{const id=self.state.commands[candidate.command_index].id;const len=self.state.commands[candidate.command_index].id_len;self.selected_len=len;@memcpy(self.selected_id[0..len],id[0..len]);}
fn item(self:*const Launcher,i:usize)Item{const c=self.state.commands[i];var dup=false;for(self.state.commands[0..self.state.command_count],0..)|other,j|if(j!=i and self.valid(other) and std.mem.eql(u8,c.name[0..c.name_len],other.name[0..other.name_len])){dup=true;break;};return .{.command_index=i,.scope=if(c.repository_id==null).workspace else .repository,.duplicate_name=dup};}
fn isRecent(self:*const Launcher,id:[]const u8)bool{for(self.recents[0..self.recent_count],self.recent_lens[0..self.recent_count])|r,l|if(std.mem.eql(u8,r[0..l],id))return true;return false;}
pub fn record(self:*Launcher,id:[]const u8)void{var found:?usize=null;for(self.recents[0..self.recent_count],self.recent_lens[0..self.recent_count],0..)|r,l,i|if(std.mem.eql(u8,r[0..l],id)){found=i;break;};if(found)|f|{var i=f;while(i>0):(i-=1){self.recents[i]=self.recents[i-1];self.recent_lens[i]=self.recent_lens[i-1];}}else{var i:@TypeOf(self.recent_count)=@min(self.recent_count,RecentLimit-1);while(i>0):(i-=1){self.recents[i]=self.recents[i-1];self.recent_lens[i]=self.recent_lens[i-1];}self.recent_count=@min(self.recent_count+1,RecentLimit);}self.recent_lens[0]=@intCast(@min(id.len,64));@memcpy(self.recents[0][0..self.recent_lens[0]],id[0..self.recent_lens[0]]);}
pub fn fail(self:*Launcher,message:[]const u8)void{self.open=true;self.error_len=@intCast(@min(message.len,self.error_message.len));@memcpy(self.error_message[0..self.error_len],message[0..self.error_len]);}
};
fn match(name:[]const u8,q:[]const u8)bool{if(q.len==0)return true;return std.ascii.indexOfIgnoreCase(name,q)!=null;}
fn less(state:*const model.State,a:Item,b:Item)bool{const x=state.commands[a.command_index];const y=state.commands[b.command_index];return std.ascii.orderIgnoreCase(x.name[0..x.name_len],y.name[0..y.name_len])==.lt;}
