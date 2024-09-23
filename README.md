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


<img width="926" alt="Screenshot 2024-09-23 at 01 42 30" src="https://github.com/user-attachments/assets/0c41ecfe-d5f6-4c6e-a730-dad64e5b72c6">

