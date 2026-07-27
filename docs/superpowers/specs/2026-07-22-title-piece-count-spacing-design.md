# Title piece-count spacing

## Goal

Recognize a package count when a trusted product title expresses it as a diaper size followed by an optional space and an integer, for example `XL 26` and `XXL 18`.

## Scope

- Update only the trusted-title parser used for price candidates.
- Keep the existing trust boundary: a count is derived only from a recognized diaper-size token followed by the count.
- Do not infer a count from unrelated title numbers.

## Data flow

`product title` -> `parsePieceCountFromProductTitle` -> `resolveTrustedPieceCount` -> candidate `piece_count` and derived per-piece price.

## Acceptance criteria

- `Merries Pants Good Skin XL 26` resolves to 26.
- `Merries Pants Good Skin XXL 18` resolves to 18.
- Existing compact (`XL26`) and hyphenated (`XL-26`) forms remain supported.
- A title without a recognized size-pack pattern remains unresolved.

## Verification

Add focused unit tests first, observe them fail before the parser change, then run the focused suite after the minimal regex update.
