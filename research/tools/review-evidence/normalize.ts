import { createHash } from "node:crypto"
import type { JsonObject, NormalizedTreatment, VisibleRole, VisibleTreatment } from "./types.ts"

export function isObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

export function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
	if (isObject(value)) {
		return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`
	}
	return JSON.stringify(value)
}

export function jsonPointer(...parts: Array<string | number>): string {
	return `/${parts.map((part) => String(part).replaceAll("~", "~0").replaceAll("/", "~1")).join("/")}`
}

function byte(value: unknown, label: string): number {
	if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 255) {
		throw new Error(`${label} must contain integer sRGB bytes`)
	}
	return value as number
}

function rgbFromHex(value: unknown, label: string): [number, number, number] {
	if (typeof value !== "string" || !/^#[a-f\d]{6}$/i.test(value)) throw new Error(`${label}.hex is invalid`)
	return [Number.parseInt(value.slice(1, 3), 16), Number.parseInt(value.slice(3, 5), 16), Number.parseInt(value.slice(5, 7), 16)]
}

function visibleRole(value: unknown, label: string): VisibleRole {
	if (!isObject(value)) throw new Error(`${label} is missing`)
	const rgb = Array.isArray(value.rgb) && value.rgb.length === 3
		? [byte(value.rgb[0], label), byte(value.rgb[1], label), byte(value.rgb[2], label)] as [number, number, number]
		: rgbFromHex(value.hex, label)
	if (typeof value.generated !== "boolean") throw new Error(`${label}.generated is missing`)
	return { rgb, generated: value.generated }
}

function treatmentId(value: JsonObject, wrapper: JsonObject): string | null {
	for (const candidate of [value.id, value.treatmentId, value.key, wrapper.treatmentId, wrapper.id]) {
		if (typeof candidate === "string" && candidate.length > 0) return candidate
	}
	return null
}

function gradientDescriptor(rawTreatmentId: string | null): { topology?: string; direction?: string } {
	if (!rawTreatmentId?.startsWith("gradient:")) return {}
	const tokens = rawTreatmentId.split(":").slice(1)
	if (tokens[0]?.startsWith("field-domain-")) tokens.shift()
	const [topology, direction] = tokens
	return {
		...(topology && !topology.startsWith("family-") ? { topology } : {}),
		...(direction && !direction.startsWith("family-") && !direction.startsWith("#") ? { direction } : {}),
	}
}

export function normalizeTreatment(
	input: unknown,
	context: { presentationVersion?: string | null; presentation?: unknown; requireCollapse?: boolean } = {},
): NormalizedTreatment {
	if (!isObject(input)) throw new Error("Treatment is not an object")
	const wrapper = input
	const value = isObject(wrapper.treatment)
		? wrapper.treatment
		: isObject(wrapper.palette)
			? wrapper.palette
			: wrapper
	const roles = isObject(value.roles) ? value.roles : value
	const collapse = value.collapse
	if (context.requireCollapse !== false &&
		(!isObject(collapse) || typeof collapse.surface !== "boolean" || typeof collapse.accent !== "boolean")) {
		throw new Error("Treatment collapse semantics are missing")
	}
	const surfaceCollapse = isObject(collapse) && typeof collapse.surface === "boolean" ? collapse.surface
		: isObject(value.backgroundSurface) && typeof value.backgroundSurface.exactlyCollapsed === "boolean"
			? value.backgroundSurface.exactlyCollapsed : null
	const accentCollapse = isObject(collapse) && typeof collapse.accent === "boolean" ? collapse.accent : null
	const gradientValue = value.gradient
	const gradientEnabled = typeof gradientValue === "boolean"
		? gradientValue
		: isObject(gradientValue) && typeof gradientValue.enabled === "boolean"
			? gradientValue.enabled
			: isObject(gradientValue) && typeof gradientValue.isGradient === "boolean"
				? gradientValue.isGradient
				: null
	if (gradientEnabled === null) throw new Error("Treatment gradient state is missing")

	const visible: VisibleTreatment = {
		schemaVersion: 1,
		roles: {
			background: visibleRole(roles.background, "background"),
			surface: visibleRole(roles.surface, "surface"),
			foreground: visibleRole(roles.foreground, "foreground"),
			accent: visibleRole(roles.accent, "accent"),
		},
		collapse: { surface: surfaceCollapse, accent: accentCollapse },
		gradient: { enabled: gradientEnabled },
	}
	const rawTreatmentId = treatmentId(value, wrapper)
	const explicitGradient = isObject(gradientValue) ? gradientValue : null
	const presentation = isObject(context.presentation) ? context.presentation : null
	const renderVariant: JsonObject = {
		schemaVersion: 1,
		treatmentIdentity: sha256(canonicalJson(visible)),
		gradient: {
			enabled: gradientEnabled,
			...gradientDescriptor(rawTreatmentId),
			...(explicitGradient && typeof explicitGradient.topology === "string" ? { topology: explicitGradient.topology } : {}),
			...(explicitGradient && typeof explicitGradient.direction === "string" ? { direction: explicitGradient.direction } : {}),
			...(explicitGradient && typeof explicitGradient.interpolation === "string" ? { interpolation: explicitGradient.interpolation } : {}),
		},
		presentationVersion: context.presentationVersion ?? null,
		gradientCss: presentation && typeof presentation.gradientCss === "string" ? presentation.gradientCss : null,
		typography: value.typography ?? wrapper.typography ?? presentation?.typography ?? null,
	}
	return {
		treatmentIdentity: renderVariant.treatmentIdentity as string,
		visible,
		renderVariantId: sha256(canonicalJson(renderVariant)),
		renderVariant,
		rawTreatmentId,
	}
}
