# research-collaboration

[日本語](./README.md)

This repository looks for people to carry out research together with the operator.
Proposals are received through GitHub issue forms.
No fee is charged, and no consideration is paid.
The collaboration is not employment.

## The operator

The operator is Takuya Nemoto (根本卓哉).
The ORCID iD is [0009-0000-1406-0547](https://orcid.org/0009-0000-1406-0547).
The GitHub account is [cpsbvbng26-dotcom](https://github.com/cpsbvbng26-dotcom).
Everything the operator has published is an unreviewed draft or tool.

## Topics

The topics for collaboration are in [TOPICS.en.md](./TOPICS.en.md).
Each is drawn from facts written in the operator's other repositories.

## Proposals

Proposals are received through the [collaboration proposal form](https://github.com/cpsbvbng26-dotcom/research-collaboration/issues/new?template=collaboration.yml).
Issues are public.
The form asks that no real name, address, affiliation, contact details or special care-required personal information, such as medical history, be written.
The form asks that the following pages be read before a proposal.

| Page | Content |
| --- | --- |
| [Terms of collaboration](./policies/terms.en.md) | Fees and consideration, not employment, voluntary, what is not taken up |
| [Authorship and contributions](./policies/authorship.en.md) | Credit by role, Claude never an author, disclosure of language-model use |
| [Licences](./policies/licences.en.md) | Text under CC BY 4.0, code under MIT, contributions the same |
| [Personal data](./policies/privacy.en.md) | What is collected, purposes of use, consent to giving issues to a language model |
| [Code of conduct](./policies/conduct.en.md) | Expected conduct and conduct not accepted |
| [Disclaimer](./policies/disclaimer.en.md) | Not legal or medical advice, no affiliation |
| [Requests](./policies/requests.en.md) | How to request, and requests that cannot be made in public |
| [Names and rights](./policies/names.en.md) | The name of this repository, and notices from rights holders |
| [Reading of the law](./policies/law.en.md) | The articles quoted, and where no conclusion is drawn |

## Other forms

- [Requests](https://github.com/cpsbvbng26-dotcom/research-collaboration/issues/new?template=request.yml)
- [Rights holder's notice](https://github.com/cpsbvbng26-dotcom/research-collaboration/issues/new?template=rights.yml)
- [Report an error](https://github.com/cpsbvbng26-dotcom/research-collaboration/issues/new?template=error-report.yml)
- Security issues are received through the route in [SECURITY.md](./SECURITY.md).

## Use of language models

The pages and code of this repository were written by Claude Code (Anthropic) at the operator's request.
Claude is not an author.
Only the title and text of an issue whose consent box is ticked are given to a language model.
Issues opened by the operator are outside this rule.

## Checks

```
node verification/check.js
node verification/check.js --break   # breaks each check in turn and confirms that it fails
node tools/statutes.js               # fetches the articles and terms again and compares (needs network)
```

## Licence

Text is under [CC BY 4.0](./LICENSE), code under [MIT](./LICENSE-CODE).
