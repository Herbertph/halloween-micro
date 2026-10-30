# HEIC test fixture

`example.heic` is the sample image from the libheif project:

- Source: <https://github.com/strukturag/libheif/blob/master/examples/example.heic>
- License: MIT (see `LICENSE` in this directory, copied from the upstream `examples/COPYING`)

It is used by `e2e/heic.spec.ts` to prove that an accepted HEIC upload is converted
in the browser (FR-7). The image is a landscape with no people in it, so it complies
with the spec's "no real people's photos" fixture rule. Do not use it as a product
asset.
