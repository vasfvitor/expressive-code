import { ExpressiveCodeBlock, ExpressiveCodeBlockOptions } from './block'
import { isBoolean, newTypeError } from '../internal/type-checks'
import { ExpressiveCodePlugin, ExpressiveCodePluginHooks, ExpressiveCodePluginHooks_BeforeRendering, PluginDataScope } from './plugin'
import { buildCodeBlockAstFromRenderedLines, buildGroupRootAstFromRenderedBlocks, renderLineToAst } from '../internal/rendering'

export interface ExpressiveCodeConfig {
	/**
	 * To add a plugin, import its initialization function and call it inside this array.
	 *
	 * If the plugin has any configuration options, you can pass them to the initialization
	 * function as an object containing your desired property values.
	 */
	plugins: ExpressiveCodePlugin[]
}

export type ExpressiveCodeProcessingInput = ExpressiveCodeBlock | ExpressiveCodeBlockOptions | (ExpressiveCodeBlock | ExpressiveCodeBlockOptions)[]

export class ExpressiveCode {
	constructor(config: ExpressiveCodeConfig) {
		this.#config = config
		this.#globalPluginData = new WeakMap()
	}

	process(input: ExpressiveCodeProcessingInput) {
		// Ensure that the input is an array
		const inputArray = Array.isArray(input) ? input : [input]

		// Validate input array and create ExpressiveCodeBlock instances if necessary
		const codeBlocks = inputArray.map((blockOrOptions) => {
			if (blockOrOptions instanceof ExpressiveCodeBlock) {
				return blockOrOptions
			} else {
				return new ExpressiveCodeBlock(blockOrOptions)
			}
		})

		// Prepare group-scoped plugin data
		const groupData: PluginDataMap = new WeakMap()

		// Render all blocks
		const renderedBlocks = codeBlocks.map((codeBlock) => {
			// Create a new scoped plugin data object for each block
			const scopedPluginData: ScopedPluginData = {
				global: this.#globalPluginData,
				group: groupData,
				block: new WeakMap(),
			}
			// Process the block and return it along with the scoped plugin data
			// and the rendered AST
			return {
				codeBlock,
				scopedPluginData,
				blockAst: this.#processSingleBlock(codeBlock, scopedPluginData),
			}
		})

		// Combine rendered blocks into a group AST
		const groupRootAst = buildGroupRootAstFromRenderedBlocks(renderedBlocks.map((renderedBlock) => renderedBlock.blockAst))
		this.#getHooks('postprocessRenderedBlockGroup').forEach(({ hookFn, plugin }) => {
			hookFn({
				groupContents: renderedBlocks.map(({ codeBlock, scopedPluginData, blockAst }) => ({
					codeBlock,
					renderData: {
						blockAst,
					},
					...this.#getBlockLevelApi(plugin, scopedPluginData),
				})),
				renderData: { groupRootAst },
			})
		})

		return {
			renderedAst: groupRootAst,
			groupContents: renderedBlocks.map(({ codeBlock, blockAst }) => ({
				codeBlock,
				blockAst,
			})),
		}
	}

	#processSingleBlock(codeBlock: ExpressiveCodeBlock, scopedPluginData: ScopedPluginData) {
		const state: ExpressiveCodeProcessingState = {
			canEditAnnotations: true,
			canEditCode: true,
			canEditMetadata: true,
		}
		codeBlock.state = state

		const runHooks = (key: keyof ExpressiveCodePluginHooks_BeforeRendering) => {
			this.#getHooks(key).forEach(({ hookFn, plugin }) => {
				hookFn({ codeBlock, ...this.#getBlockLevelApi(plugin, scopedPluginData) })
			})
		}

		// Run hooks for preprocessing metadata and code
		state.canEditCode = false
		runHooks('preprocessMetadata')
		state.canEditCode = true
		runHooks('preprocessCode')

		// Run hooks for processing & finalizing the code
		runHooks('performSyntaxAnalysis')
		runHooks('postprocessAnalyzedCode')
		state.canEditCode = false

		// Run hooks for annotating the code
		runHooks('annotateCode')
		runHooks('postprocessAnnotations')
		state.canEditMetadata = false
		state.canEditAnnotations = false

		// Render annotations and run rendering hooks
		const lines = codeBlock.getLines()
		const renderedAstLines = lines.map((line, lineIndex) => {
			const renderData = {
				lineAst: renderLineToAst(line),
			}
			// Allow plugins to modify or even completely replace the AST
			this.#getHooks('postprocessRenderedLine').forEach(({ hookFn, plugin }) => {
				hookFn({ codeBlock, line, lineIndex, renderData, ...this.#getBlockLevelApi(plugin, scopedPluginData) })
			})
			return renderData.lineAst
		})

		// Combine rendered lines into a block AST
		const blockAst = buildCodeBlockAstFromRenderedLines(renderedAstLines)
		this.#getHooks('postprocessRenderedBlock').forEach(({ hookFn, plugin }) => {
			hookFn({ codeBlock, renderData: { blockAst }, ...this.#getBlockLevelApi(plugin, scopedPluginData) })
		})

		return blockAst
	}

	/**
	 * Returns an array of hooks that were registered by plugins for the given hook type.
	 *
	 * Each hook is returned as an object containing the plugin that registered it,
	 * the hook function itself, and a context object that contains functions that should
	 * be available to the plugin when the hook is called.
	 */
	#getHooks<HookType extends keyof ExpressiveCodePluginHooks>(key: HookType) {
		return this.#config.plugins.flatMap((plugin) => {
			const hookFn = plugin.hooks[key]
			if (!hookFn) return []
			return [{ hookFn, plugin }]
		})
	}

	#getBlockLevelApi(plugin: ExpressiveCodePlugin, scopedPluginData: ScopedPluginData) {
		return {
			getPluginData: <Type extends object = object>(scope: PluginDataScope, initialValue: Type) => {
				const map = scopedPluginData[scope]
				let data = map.get(plugin) as Type
				if (data === undefined) {
					data = initialValue
					map.set(plugin, data)
				}
				return data
			},
		}
	}

	readonly #config: ExpressiveCodeConfig
	readonly #globalPluginData: PluginDataMap
}

export type PluginDataMap = WeakMap<ExpressiveCodePlugin, object>

export interface ScopedPluginData {
	global: PluginDataMap
	group: PluginDataMap
	block: PluginDataMap
}

export interface ExpressiveCodeProcessingState {
	canEditCode: boolean
	canEditMetadata: boolean
	canEditAnnotations: boolean
}

export function validateExpressiveCodeProcessingState(state: ExpressiveCodeProcessingState | undefined) {
	const isValid = state && isBoolean(state.canEditCode) && isBoolean(state.canEditMetadata) && isBoolean(state.canEditAnnotations)
	if (!isValid) throw newTypeError('ExpressiveCodeProcessingState', state)
}
