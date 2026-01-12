# Gradient Detection

Two methods for determining if two background colors are part of a gradient or represent fully separate color regions.

## Methods Implemented

### 1. Histogram Analysis

Creates a 1D histogram in perceptually uniform color space (OKLAB) along the interpolation path between two colors.

**How it works:**
- Projects each pixel onto the line between `color1` and `color2` in OKLAB space
- Only considers pixels within 30% deviation from the direct interpolation path
- Creates 50 bins along this path
- Analyzes the distribution for continuity and coverage

**Gradient characteristics:**
- **High coverage** (>10%): Many pixels lie on the interpolation path
- **High continuity** (>40%): Few gaps in the histogram bins
- **Few gaps** (<30%): The distribution is relatively uniform

**Separate colors characteristics:**
- Bimodal distribution (peaks at both ends)
- Large gaps in the middle bins
- Low continuity score

**Usage:**
```typescript
import { histogramAnalysis } from "./gradientDetection.ts"
import { oklabSpace } from "./spaces/oklab.ts"

const result = histogramAnalysis(color1, color2, imageData, meta, oklabSpace)
console.log(result.isGradient) // true/false
console.log(result.confidence) // 0-1
console.log(result.details.coverage) // percentage of pixels on the path
console.log(result.details.continuityScore) // how continuous the distribution is
```

### 2. Clustering the Intermediate Zone

Extracts pixels that fall between the two colors in color space and analyzes their spatial distribution using connected component analysis.

**How it works:**
- Identifies "intermediate" pixels that are:
  - Within 25% deviation from the interpolation path
  - Not too close to either extreme (>20% of total distance from each color)
- Uses flood-fill to find connected components
- Analyzes spatial coherence

**Gradient characteristics:**
- **Few large clusters** (1-5): Intermediate pixels form coherent bands
- **High cluster ratio** (>60%): Most intermediate pixels are in one large cluster
- **Sufficient coverage** (>5%): Reasonable number of intermediate pixels exist

**Separate colors characteristics:**
- Very few or no intermediate pixels
- Many small disconnected clusters
- Low cluster ratio (pixels scattered randomly)

**Usage:**
```typescript
import { clusterIntermediateZone } from "./gradientDetection.ts"

const result = clusterIntermediateZone(color1, color2, imageData, meta, oklabSpace)
console.log(result.isGradient) // true/false
console.log(result.details.clusterCount) // number of connected regions
console.log(result.details.largestClusterSize) // pixels in biggest cluster
```

### 3. Combined Detection

Uses both methods and returns the most confident result. When both methods agree, confidence is boosted by 20%.

**Usage:**
```typescript
import { detectGradient } from "./gradientDetection.ts"

const result = detectGradient(color1, color2, imageData, meta, oklabSpace)
console.log(result.isGradient) // true/false
console.log(result.confidence) // 0-1, higher when methods agree
console.log(result.details.agreement) // do both methods agree?
```

## Example Integration

See [example-gradient-detection.ts](./example-gradient-detection.ts) for a complete example that:
1. Loads an image
2. Extracts colors using `extractColors()`
3. Analyzes if the background colors form a gradient
4. Reports detailed metrics from both methods

Run it:
```bash
node --experimental-strip-types example-gradient-detection.ts ./images/disney.avif
```

## Test Results

All tests pass successfully:

- ✔ **Histogram Analysis - Gradient Detection**: Correctly identifies gradients with 100% confidence
- ✔ **Histogram Analysis - Separate Colors**: Correctly identifies sharp boundaries
- ✔ **Intermediate Zone Clustering - Gradient**: Detects coherent intermediate zones
- ✔ **Intermediate Zone Clustering - Separate Colors**: Identifies absence of intermediate pixels
- ✔ **Combined Detection**: Provides high confidence when methods agree

See [tests/gradient-detection.test.ts](./tests/gradient-detection.test.ts) for test implementations.

## When to Use Which Method

### Use Histogram Analysis when:
- You have smooth, continuous gradients
- Colors transition evenly across the image
- You want to detect subtle color progressions

### Use Intermediate Zone Clustering when:
- You need to verify spatial coherence
- Gradients might be localized to specific regions
- You want to detect abrupt boundaries vs smooth transitions

### Use Combined Detection when:
- You need maximum confidence
- The gradient nature is ambiguous
- You want robust detection across different gradient types

## Performance Considerations

Both methods iterate through all pixels once:
- **Time complexity**: O(n) where n = number of pixels
- **Space complexity**: 
  - Histogram: O(bins) ≈ O(1) (default 50 bins)
  - Clustering: O(n) for the bitmap and visited arrays
- **Recommended**: Use histogram analysis first for quick detection, fall back to clustering for ambiguous cases

## Tunable Parameters

### Histogram Analysis
- `bins` (default: 50): Number of histogram bins. More bins = finer granularity
- Path deviation threshold (default: 30%): How far pixels can deviate from the direct path
- Coverage threshold (default: 10%): Minimum percentage for gradient detection
- Continuity threshold (default: 40%): Minimum bin coverage required

### Intermediate Zone Clustering
- Path deviation (default: 25%): Maximum deviation from interpolation path
- Minimum distance from extremes (default: 20%): How far from each color to be "intermediate"
- Cluster ratio threshold (default: 60%): Minimum ratio of pixels in largest cluster
- Coverage threshold (default: 5%): Minimum intermediate pixel percentage

These can be adjusted in [gradientDetection.ts](./gradientDetection.ts) based on your specific use case.
