# Third-party notices

## DeepSeek Harness

The bounded DeepSeek native web-search adapter in `lib/server/model-provider.ts`
is adapted from `deepseek-ai/deepseek-harness`, package
`@deepseek-ai/dsh-web-search-deepseek`.

- Source: https://github.com/deepseek-ai/deepseek-harness
- License: MIT
- Referenced commit: `b150a551` on repository `master`, reviewed 2026-08-22
- Local changes: removed the Cordis/plugin layer, kept structured Anthropic
  response parsing, aligned the native search budget to the upstream default of
  five tool uses, capped application-visible sources, and mapped failures to
  CareerPyxis errors.

Copyright belongs to the original DeepSeek Harness contributors. The original
MIT license applies to the adapted portions.

## Domestic recruitment implementation references

The Beisen (`*.zhiye.com`) source boundary and public job-page/API patterns in
`lib/server/job-verification-service.ts` were researched against these MIT
projects. CareerPyxis uses its own TypeScript implementation and a narrower
read-only verification scope; it does not bundle either project.

- `gzchenhao/openhire`, Beisen adapter and tests
  - Source: https://github.com/gzchenhao/openhire
  - License: MIT
  - Referenced commit: `5effdec7d96195fe48fbc9882b49dc636fbb2068`
- `genius916/CareerSail`, campus-recruitment Beisen adapter
  - Source: https://github.com/genius916/CareerSail
  - License: MIT
  - Referenced commit: `aa09a9c39938acc2d434868b456963b5c89dc9ba`

The local implementation adds a fixed HTTPS hostname/path allowlist, response
size and timeout limits, same-host application-link validation, closed-page
markers, and a separate model fit check. University career portals, social
posts, and aggregators remain discovery leads and are never returned as the
application URL.

### MIT License

Copyright (c) 2026 DeepSeek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
