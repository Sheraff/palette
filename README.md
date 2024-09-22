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
	useWorkers: true,
	colorSpace: oklabSpace,
	strategy: gapStatisticKmeans({ max: 10 }),
	clamp: 0.005,
})
```

![localhost_3000_](https://github.com/user-attachments/assets/9de3c5e3-0b3f-4085-9f10-9bd7108cd4cf)


