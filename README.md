# Color palette extraction

> [!WARNING]
> This library is still in development and the API is subject to change.
> - The entry point is `extractColors.ts`
> - use `pnpm test` to launch the tests
> - use `pnpm serve` to get a visual preview of what is happening on `localhost:3000`

With an emphasis on 
- **Accuracy**, using a clustering algorithm and saliency feature detection to find the most representative colors.
  *Other libraries use a simple histogram and manual thresholding / quantization*
- **Usability**, by returning colors that are visually distinct and can be used in a design.
  *Other libraries return "just the main colors", we also look for contrast and accents*
- **Speed**, by using worker threads and array buffers.
  *Other libraries are synchronous and require a lot of memory to run*


```ts
const colors = await extractColors(buffer, 3, {
	workers: true,
	colorSpace: oklabSpace,
	strategy: gapStatisticKmeans({ max: 10 }),
	clamp: 0.005,
})
```

## How does it work

| image | step |
|-----|-----|
| ![maroon5-scrambled](https://github.com/user-attachments/assets/cfebd938-680a-4a1c-99ca-c78c695c1c83) | original image (*here the original image is scrambled to avoid infringing on copyrights*) |
| <img width="298" alt="Screenshot 2024-09-29 at 14 52 30" src="https://github.com/user-attachments/assets/d492f285-b65b-488b-b007-41ea189738fa"> | main colors are extracted by [k-means](https://en.wikipedia.org/wiki/K-means_clustering) clustering |
| ![maroon5-masked](https://github.com/user-attachments/assets/23166d7a-9dbf-45d6-9461-9eeff1112c66) | the **background** is picked from extracted colors by looking at the most prevalent colors outside of the masked center |
| ![maroon5-saliency](https://github.com/user-attachments/assets/eafe7d71-6987-4bd8-8c19-7dce327d9722) | the **foreground** is picked from the most salient features by [Itti-Koch filtering](https://en.wikipedia.org/wiki/Laurent_Itti) of the image |
| <img width="598" alt="Screenshot 2024-09-29 at 14 54 39" src="https://github.com/user-attachments/assets/21d409e2-be9c-464e-8143-d1ea135b2893"> | main colors are split into 2 pools depending on their proximity with either the background or the foreground |
| <img width="296" alt="Screenshot 2024-09-29 at 14 55 01" src="https://github.com/user-attachments/assets/84831c11-2103-42d0-8541-4fa2d800cbdb"> | <ul><li>the **accent** is picked from the foreground pool based on its *chroma*, *prevalence*, and *distance* to the already picked colors. </li><li> the **alternate background** is picked from the background pool based on its *prevalence* and *contrast* with the foreground colors.</li></ul> |


## Sample of results

<img width="927" alt="Screenshot 2024-09-29 at 15 11 04" src="https://github.com/user-attachments/assets/6a25f428-7cff-4006-b58b-90b04c875cf1">

## Multi-threading

A lot of the work done by this library is CPU intensive, so if performance is *at all* a concern, you should enable multithreading by using the `workers: true` option. If [`piscina`](https://www.npmjs.com/package/piscina) is installed, it will be used to manage the worker pool, and the pool can be provided (`worker: pool`) to integrate with the rest of your application

## Unit-testing colors

Because changes on "color manipulation" algorithms can be chaotic, we need to be able to test our resulting colors with some form of *fuzzy matching*. Additionally, color codes don't immediately mentally map to actual colors, making tests hard to read.

For this we base our tests on "named colors" (taken from the CSS list):
```ts
t.diagnostic(`accent: ${hex(accent)} >> ${nameColor(accent)} (${simpleColor(accent)})`)
assert.strictEqual(nameColor(accent), 'lightcoral')
// will output: ℹ accent: #f85963 >> lightcoral (salmon)
```
