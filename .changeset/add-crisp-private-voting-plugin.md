---
"@aragon/app": minor
---

Add the CRISP private voting plugin: encrypted ballots tallied by the Interfold network, with DAO setup, proposal creation (including the fee deposit step), encrypted vote submission and on-chain proposal resolution. To support it, process (SPP) bodies can contribute custom proposal parameters, plugins can add prerequisite steps to the publish proposal dialog and resolve proposals with state the backend does not index, the token import can reject tokens without governance support instead of wrapping them, and the content security policy allows `data:` and `blob:` connections.
