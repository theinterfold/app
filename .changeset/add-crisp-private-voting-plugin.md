---
"@aragon/app": minor
---

Add the CRISP private voting plugin: DAOs can set up a token-weighted body whose ballots are encrypted in the browser and tallied by the Interfold network, create its proposals (paying the private computation fee from a fee credit, which can be topped up from the publish dialog and withdrawn or refunded when a round fails), submit encrypted votes and read the result resolved on-chain, on its own or as a body of a staged process. The token import used when setting up the body can reject tokens without governance (`IVotes`) support instead of wrapping them
