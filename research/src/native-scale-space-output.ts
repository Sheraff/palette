import { randomUUID } from "node:crypto"
import type { Stats } from "node:fs"
import { lstat, mkdir, mkdtemp, realpath, rename, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, isAbsolute, join, posix, relative, resolve, sep, win32 } from "node:path"

export const NATIVE_SCALE_SPACE_EXPERIMENT_ID =
	"native-scale-space-evidence-audit-0.1.0-development" as const
export const NATIVE_SCALE_SPACE_OUTPUT_PROTOCOL_VERSION = "native-scale-space-output-v1" as const

export type NativeScaleSpaceOutputPaths = Readonly<{
	researchRoot: string
	experimentsRoot: string
	finalDirectory: string
}>

export type NativeScaleSpacePublicationAttempt = Readonly<{
	mode: "publish"
	stagingDirectory: string
	finalDirectory: string
}>

export type NativeScaleSpaceNoPublishAttempt = Readonly<{
	mode: "no-publish"
	temporaryDirectory: string
}>

type DirectoryIdentity = Pick<Stats, "dev" | "ino">

type PublicationRootIdentity = {
	paths: NativeScaleSpaceOutputPaths
	realResearchRoot: string
	realExperimentsRoot: string
	directoryIdentity: DirectoryIdentity
}

type PublicationState = {
	status: "staging" | "published" | "failed"
	root: PublicationRootIdentity
	stagingIdentity: DirectoryIdentity
}

type NoPublishState = {
	status: "temporary" | "removed" | "failed"
	realTemporaryRoot: string
	temporaryIdentity: DirectoryIdentity
}

const publicationStates = new WeakMap<NativeScaleSpacePublicationAttempt, PublicationState>()
const noPublishStates = new WeakMap<NativeScaleSpaceNoPublishAttempt, NoPublishState>()

function isMissingPathError(error: unknown): boolean {
	return (error as NodeJS.ErrnoException).code === "ENOENT"
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await lstat(path)
		return true
	} catch (error) {
		if (isMissingPathError(error)) return false
		throw error
	}
}

function isWithin(root: string, target: string): boolean {
	const pathFromRoot = relative(root, target)
	return pathFromRoot === "" ||
		(pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot))
}

function requirePathArgument(path: string, label: string): void {
	if (typeof path !== "string" || path.trim().length === 0 || path.includes("\0")) {
		throw new Error(`${label} must be a non-empty filesystem path`)
	}
}

export function resolveNativeScaleSpaceOutputPaths(researchRoot: string): NativeScaleSpaceOutputPaths {
	requirePathArgument(researchRoot, "Research root")
	const resolvedResearchRoot = resolve(researchRoot)
	const experimentsRoot = join(resolvedResearchRoot, "data", "experiments")
	const finalDirectory = join(experimentsRoot, NATIVE_SCALE_SPACE_EXPERIMENT_ID)
	if (dirname(finalDirectory) !== experimentsRoot) {
		throw new Error("Native scale-space final directory is not a direct child of the experiment root")
	}
	return Object.freeze({ researchRoot: resolvedResearchRoot, experimentsRoot, finalDirectory })
}

async function requirePhysicalPublicationRoot(
	paths: NativeScaleSpaceOutputPaths,
): Promise<PublicationRootIdentity> {
	let metadata: Stats
	try {
		metadata = await lstat(paths.experimentsRoot)
	} catch (error) {
		if (isMissingPathError(error)) {
			throw new Error(`Experiment root must already exist as a real directory: ${paths.experimentsRoot}`)
		}
		throw error
	}
	if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
		throw new Error(`Experiment root must be a non-symlink directory: ${paths.experimentsRoot}`)
	}

	const [realResearchRoot, realExperimentsRoot] = await Promise.all([
		realpath(paths.researchRoot),
		realpath(paths.experimentsRoot),
	])
	if (realExperimentsRoot !== join(realResearchRoot, "data", "experiments")) {
		throw new Error(`Experiment root does not physically reside under ${realResearchRoot}`)
	}
	return {
		paths,
		realResearchRoot,
		realExperimentsRoot,
		directoryIdentity: { dev: metadata.dev, ino: metadata.ino },
	}
}

async function assertPublicationRootUnchanged(expected: PublicationRootIdentity): Promise<void> {
	const current = await requirePhysicalPublicationRoot(expected.paths)
	if (current.realResearchRoot !== expected.realResearchRoot ||
		current.realExperimentsRoot !== expected.realExperimentsRoot ||
		current.directoryIdentity.dev !== expected.directoryIdentity.dev ||
		current.directoryIdentity.ino !== expected.directoryIdentity.ino) {
		throw new Error("Experiment root changed during the native scale-space output attempt")
	}
}

async function requireOwnedDirectory(
	path: string,
	parent: string,
	realParent: string,
	expected: DirectoryIdentity,
	label: string,
): Promise<void> {
	if (dirname(path) !== parent) throw new Error(`${label} is not a direct child of its required root`)
	const metadata = await lstat(path)
	if (metadata.isSymbolicLink() || !metadata.isDirectory() ||
		metadata.dev !== expected.dev || metadata.ino !== expected.ino) {
		throw new Error(`${label} changed after exclusive creation: ${path}`)
	}
	if (await realpath(path) !== join(realParent, basename(path))) {
		throw new Error(`${label} does not physically reside under its required root: ${path}`)
	}
}

function requireStagingState(attempt: NativeScaleSpacePublicationAttempt): PublicationState {
	const state = publicationStates.get(attempt)
	if (!state) throw new Error("Unknown native scale-space publication attempt")
	if (state.status !== "staging") {
		throw new Error(`Native scale-space publication attempt is already ${state.status}`)
	}
	return state
}

export async function createNativeScaleSpacePublicationAttempt(
	researchRoot: string,
): Promise<NativeScaleSpacePublicationAttempt> {
	const paths = resolveNativeScaleSpaceOutputPaths(researchRoot)
	const root = await requirePhysicalPublicationRoot(paths)
	if (await pathExists(paths.finalDirectory)) {
		throw new Error(`Refusing to overwrite preexisting native scale-space output: ${paths.finalDirectory}`)
	}

	const stagingDirectory = join(
		paths.experimentsRoot,
		`.${NATIVE_SCALE_SPACE_EXPERIMENT_ID}.staging-${randomUUID()}`,
	)
	try {
		await mkdir(stagingDirectory, { recursive: false, mode: 0o700 })
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") {
			throw new Error(`Refusing to reuse native scale-space staging directory: ${stagingDirectory}`)
		}
		throw error
	}
	const stagingMetadata = await lstat(stagingDirectory)
	if (stagingMetadata.isSymbolicLink() || !stagingMetadata.isDirectory()) {
		throw new Error(`Exclusive native scale-space staging path is not a real directory: ${stagingDirectory}`)
	}

	const attempt = Object.freeze({
		mode: "publish" as const,
		stagingDirectory,
		finalDirectory: paths.finalDirectory,
	})
	publicationStates.set(attempt, {
		status: "staging",
		root,
		stagingIdentity: { dev: stagingMetadata.dev, ino: stagingMetadata.ino },
	})
	return attempt
}

export async function publishNativeScaleSpacePublication(
	attempt: NativeScaleSpacePublicationAttempt,
): Promise<string> {
	const state = requireStagingState(attempt)
	await assertPublicationRootUnchanged(state.root)
	await requireOwnedDirectory(
		attempt.stagingDirectory,
		state.root.paths.experimentsRoot,
		state.root.realExperimentsRoot,
		state.stagingIdentity,
		"Native scale-space staging directory",
	)
	if (await pathExists(attempt.finalDirectory)) {
		throw new Error(`Refusing to overwrite preexisting native scale-space output: ${attempt.finalDirectory}`)
	}

	await rename(attempt.stagingDirectory, attempt.finalDirectory)
	state.status = "published"
	await requireOwnedDirectory(
		attempt.finalDirectory,
		state.root.paths.experimentsRoot,
		state.root.realExperimentsRoot,
		state.stagingIdentity,
		"Native scale-space final directory",
	)
	return attempt.finalDirectory
}

function compactUtcTimestamp(date: Date): string {
	return date.toISOString().replaceAll("-", "").replaceAll(":", "").replace(".", "")
}

export async function preserveFailedNativeScaleSpacePublication(
	attempt: NativeScaleSpacePublicationAttempt,
): Promise<string> {
	const state = requireStagingState(attempt)
	await assertPublicationRootUnchanged(state.root)
	await requireOwnedDirectory(
		attempt.stagingDirectory,
		state.root.paths.experimentsRoot,
		state.root.realExperimentsRoot,
		state.stagingIdentity,
		"Native scale-space staging directory",
	)

	const failedDirectory = join(
		state.root.paths.experimentsRoot,
		`${NATIVE_SCALE_SPACE_EXPERIMENT_ID}.failed-${compactUtcTimestamp(new Date())}-${randomUUID()}`,
	)
	if (await pathExists(failedDirectory)) {
		throw new Error(`Refusing to overwrite failed native scale-space output: ${failedDirectory}`)
	}
	await rename(attempt.stagingDirectory, failedDirectory)
	state.status = "failed"
	await requireOwnedDirectory(
		failedDirectory,
		state.root.paths.experimentsRoot,
		state.root.realExperimentsRoot,
		state.stagingIdentity,
		"Failed native scale-space directory",
	)
	return failedDirectory
}

async function realpathIfPresent(path: string): Promise<string | undefined> {
	try {
		return await realpath(path)
	} catch (error) {
		if (isMissingPathError(error) || (error as NodeJS.ErrnoException).code === "ENOTDIR") return undefined
		throw error
	}
}

export async function createNativeScaleSpaceNoPublishAttempt(
	researchRoot: string,
): Promise<NativeScaleSpaceNoPublishAttempt> {
	const paths = resolveNativeScaleSpaceOutputPaths(researchRoot)
	const temporaryRoot = resolve(tmpdir())
	const realTemporaryRoot = await realpath(temporaryRoot)
	const realExperimentsRoot = await realpathIfPresent(paths.experimentsRoot)
	if (isWithin(paths.experimentsRoot, temporaryRoot) ||
		(realExperimentsRoot !== undefined && isWithin(realExperimentsRoot, realTemporaryRoot))) {
		throw new Error("No-publish temporary root must not reside under the experiment root")
	}

	const createdDirectory = await mkdtemp(join(
		temporaryRoot,
		`${NATIVE_SCALE_SPACE_EXPERIMENT_ID}-`,
	))
	const metadata = await lstat(createdDirectory)
	const temporaryDirectory = await realpath(createdDirectory)
	if (dirname(createdDirectory) !== temporaryRoot || metadata.isSymbolicLink() || !metadata.isDirectory() ||
		temporaryDirectory !== join(realTemporaryRoot, basename(createdDirectory))) {
		throw new Error(`No-publish path is not a real temporary child directory: ${createdDirectory}`)
	}

	const attempt = Object.freeze({ mode: "no-publish" as const, temporaryDirectory })
	noPublishStates.set(attempt, {
		status: "temporary",
		realTemporaryRoot,
		temporaryIdentity: { dev: metadata.dev, ino: metadata.ino },
	})
	return attempt
}

function requireTemporaryState(attempt: NativeScaleSpaceNoPublishAttempt): NoPublishState {
	const state = noPublishStates.get(attempt)
	if (!state) throw new Error("Unknown native scale-space no-publish attempt")
	if (state.status !== "temporary") {
		throw new Error(`Native scale-space no-publish attempt is already ${state.status}`)
	}
	return state
}

export async function removeSuccessfulNativeScaleSpaceNoPublish(
	attempt: NativeScaleSpaceNoPublishAttempt,
): Promise<void> {
	const state = requireTemporaryState(attempt)
	const temporaryRoot = dirname(attempt.temporaryDirectory)
	await requireOwnedDirectory(
		attempt.temporaryDirectory,
		temporaryRoot,
		state.realTemporaryRoot,
		state.temporaryIdentity,
		"Native scale-space no-publish directory",
	)
	await rm(attempt.temporaryDirectory, { recursive: true })
	state.status = "removed"
}

export function preserveFailedNativeScaleSpaceNoPublish(
	attempt: NativeScaleSpaceNoPublishAttempt,
): string {
	const state = requireTemporaryState(attempt)
	state.status = "failed"
	return attempt.temporaryDirectory
}

export function validateNativeScaleSpaceArtifactRelativePath(artifactPath: string): string {
	if (typeof artifactPath !== "string" || artifactPath.length === 0 ||
		/[\0-\x1f\x7f]/.test(artifactPath) || artifactPath.includes("\\") ||
		posix.isAbsolute(artifactPath) || win32.isAbsolute(artifactPath) || /^[A-Za-z]:/.test(artifactPath)) {
		throw new Error(`Unsafe native scale-space artifact-relative path: ${String(artifactPath)}`)
	}
	const segments = artifactPath.split("/")
	if (segments.some((segment) => segment === "" || segment === "." || segment === "..") ||
		posix.normalize(artifactPath) !== artifactPath) {
		throw new Error(`Unsafe native scale-space artifact-relative path: ${artifactPath}`)
	}
	return artifactPath
}

export function resolveNativeScaleSpaceArtifactPath(
	artifactDirectory: string,
	artifactPath: string,
): string {
	requirePathArgument(artifactDirectory, "Artifact directory")
	const root = resolve(artifactDirectory)
	const safeRelativePath = validateNativeScaleSpaceArtifactRelativePath(artifactPath)
	const resolvedArtifactPath = resolve(root, ...safeRelativePath.split("/"))
	if (resolvedArtifactPath === root || !isWithin(root, resolvedArtifactPath)) {
		throw new Error(`Native scale-space artifact path escapes its directory: ${artifactPath}`)
	}
	return resolvedArtifactPath
}
