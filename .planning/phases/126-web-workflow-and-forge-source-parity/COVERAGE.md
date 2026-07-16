# API Coverage — GitHub GraphQL and GitLab REST

> Full coverage by default. Opt-outs are explicit, reasoned decisions. This matrix covers the provider capabilities touched by Phase 126's reviewed forge-source resolver; it does not claim to wrap either provider's unrelated product API.

| capability | decision | reason |
|---|---|---|
| GitHub resolve pull request by canonical coordinates | INTEGRATE | |
| GitHub read PR state, refs, OIDs, repositories, and fork flag | INTEGRATE | |
| GitHub select an explicitly allowed self-hosted hostname | INTEGRATE | |
| GitHub submit-time pull-request recheck | INTEGRATE | |
| GitHub write operations | OPT-OUT | explicitly out of scope; Phase 126 is a read-only source resolver and normal local workspace creator |
| GitHub request unneeded user-authored content | OPT-OUT | unnecessary data and output-injection surface for the reviewed creation contract |
| GitHub provider-side checkout | OPT-OUT | explicitly prohibited; plain Git and the existing workspace creation path remain authoritative |
| GitLab resolve merge request by target project and IID | INTEGRATE | |
| GitLab read MR state, projects, branches, and head SHA | INTEGRATE | |
| GitLab resolve source-project identity and trusted fetch data | INTEGRATE | |
| GitLab select an explicitly allowed self-managed hostname | INTEGRATE | |
| GitLab submit-time merge-request and source-project recheck | INTEGRATE | |
| GitLab write operations | OPT-OUT | explicitly out of scope; Phase 126 is a read-only source resolver and normal local workspace creator |
| GitLab request merge-request description or other unneeded user-authored content | OPT-OUT | unnecessary data and output-injection surface for the reviewed creation contract |
| GitLab provider-side checkout | OPT-OUT | explicitly prohibited; plain Git and the existing workspace creation path remain authoritative |
| Provider authentication management | OPT-OUT | credentials remain in the official CLI auth stores; the service only classifies missing/auth failures |
| Provider webhook, polling, or durable remote synchronization | OPT-OUT | explicitly out of scope; resolve and submit-time recheck are bounded on-demand reads |
| Gitea reviewed resolver | OPT-OUT | explicitly deferred by Phase 126 context; existing CLI/core behavior is not removed |
