# Provenance and third-party notices

## Independent project

The repository began as a visual study of the publicly visible Soloop website.
The current source uses newly written public pages, original simple SVG marks,
and independent workspace code. Copied Soloop logos, marketing illustrations,
photographs, testimonials, policy copy, recovered CSS, and downloaded fonts were
removed from the publication version. This project is not affiliated with or
endorsed by Soloop; the name identifies its history, not ownership of that brand.

The current original code and technical documentation use the [MIT license](../LICENSE).
That license grants no rights to the Soloop trademark or to materials outside the
current source tree. Historical reference material must not be republished merely
because this code is MIT licensed.

## Included third-party software

- The local build helper's full notice is preserved in
  [sites-vite-plugin.LICENSE](../build/sites-vite-plugin.LICENSE).
- The vendored shadcn Tailwind stylesheet retains its
  [MIT notice](../vendor/shadcn-tailwind-4.13.0.LICENSE.md).
- UI primitives under `components/ui/` came from the starter's shadcn/Radix-based
  component catalog. The shadcn/ui MIT notice is included in
  [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
- Package dependencies retain the licenses and notices shipped in their package
  distributions; `package-lock.json` identifies the installed versions.

No external fonts, photos, illustration downloads, or model weights are bundled.
The current icon and wordmark are original geometric/text SVGs covered by MIT.
AI output has no automatic license guarantee; review provider terms and the
content you supply before redistributing generated documents.
