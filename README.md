# Color palette extraction

With an emphasis on 
- **Accuracy**, using a clustering algorithm to find the most representative colors.
  *Other libraries use a simple histogram and manual thresholding / quantization*
- **Usability**, by returning colors that are visually distinct and can be used in a design.
  *Other libraries return "just the main colors", we also look for contrast and accents*
- **Speed**, by using worker threads and array buffers.
  *Other libraries are synchronous and require a lot of memory to run*


```ts
const colors = await extractColors(buffer, 3, {
	useWorkers: USE_WORKERS,
	colorSpace: oklchSpace,
	strategy: gapStatisticKmeans({ max: 10 })
})
```