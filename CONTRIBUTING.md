# Contributing to AI Obligations Atlas

Thank you for helping. AI Obligations Atlas is part of the Triodian AI governance apps and is open source under the
[Apache License, Version 2.0](LICENSE).

## Before you start

- For anything larger than a small fix, open an issue first so we can agree the approach.
- To report a security problem, do not open an issue: see [SECURITY.md](SECURITY.md).
- Please follow the [code of conduct](CODE_OF_CONDUCT.md).

## Making a change

1. Fork the repository and create a branch from `main`.
2. Make the change, with tests. Unit tests are in `test/`.
3. Run the tests:
   ```
   npm ci
   npm test
   ```
4. Open a pull request against `main`, saying what changed and why. The tests run on every pull request.

## What we look for

- **Plain wording.** Text people read in the app is short and plain. Records state what sources say; reviewers approve every change to the data.
- **No legal conclusions.** The app records facts and the positions people take. It never says what the law requires;
  that is for counsel.
- **No client data.** Never commit client names, personal information, documents or secrets, in code, tests or
  fixtures. Worked examples use fictional organisations.
- **Small, focused pull requests.** One change per pull request is easier to review.

By contributing you agree that your contribution is licensed under the Apache License, Version 2.0, as set out in its
section 5.
