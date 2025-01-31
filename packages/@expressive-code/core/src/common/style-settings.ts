import { CoreStyleSettings } from '../internal/core-styles'
import { ExpressiveCodeTheme } from './theme'

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface StyleSettings extends CoreStyleSettings {}

export type StyleValueOrValues = string | [dark: string, light: string]
export type StyleResolverFn = ({
	theme,
	styleVariantIndex,
	resolveSetting,
}: {
	theme: ExpressiveCodeTheme
	/** The index in the engine's `styleVariants` array that's currently being resolved. */
	styleVariantIndex: number
	resolveSetting: (settingPath: StyleSettingPath) => string
}) => StyleValueOrValues
export type UnresolvedStyleValue = StyleValueOrValues | StyleResolverFn

export type UnresolvedPluginStyleSettings<T> = {
	[SettingName in keyof T]: UnresolvedStyleValue
}

type Keys<T> = Exclude<keyof T, symbol>
type FlattenKeys<T> = { [K in Keys<T>]: T[K] extends object ? `${K}.${Keys<T[K]>}` : K }[Keys<T>]

export type StyleSettingPath = FlattenKeys<StyleSettings>

export type UnresolvedStyleSettings = {
	[K in keyof StyleSettings]: StyleSettings[K] extends object ? UnresolvedPluginStyleSettings<StyleSettings[K]> : UnresolvedStyleValue
}

export type StyleOverrides = Partial<{
	[K in keyof StyleSettings]: StyleSettings[K] extends object ? Partial<UnresolvedPluginStyleSettings<StyleSettings[K]>> : UnresolvedStyleValue
}>

export type ResolvedStyleSettingsByPath = Map<StyleSettingPath, string>

/**
 * A map of long terms commonly found in style setting paths to shorter alternatives that are
 * still human-readable. These replacements are automatically applied by {@link getCssVarName}
 * when generating CSS variable names to keep them fairly short.
 *
 * Plugins can add their own replacements to this map by importing this constant and calling
 * `cssVarReplacements.set('myLongTerm', 'myLt')` inside their plugin initialization function.
 */
export const cssVarReplacements = new Map<string, string>([
	['background', 'bg'],
	['foreground', 'fg'],
	['color', 'col'],
	['border', 'brd'],
	['padding', 'pad'],
	['margin', 'marg'],
	['radius', 'rad'],
	['opacity', 'opa'],
	['width', 'wd'],
	['height', 'ht'],
	['weight', 'wg'],
	['block', 'blk'],
	['inline', 'inl'],
	['bottom', 'btm'],
	['value', 'val'],
	['active', 'act'],
	['inactive', 'inact'],
	['highlight', 'hl'],
	['selection', 'sel'],
	['indicator', 'ind'],
	['shadow', 'shd'],
	['family', 'fml'],
	['transform', 'trf'],
	['decoration', 'dec'],
	['button', 'btn'],
	['editor', 'ed'],
	['terminal', 'trm'],
	['scrollbar', 'sb'],
	['toolbar', 'tb'],
	['titlebar', 'ttb'],
	['textMarkers', 'tm'],
	['frames', 'frm'],
])

/**
 * Generates a CSS variable name for a given style setting path.
 *
 * Performs the following transformations on the path:
 * - To avoid name collisions, the name is prefixed with `--ec-`.
 * - All dots in the path are replaced with dashes.
 * - Various common terms are replaced with shorter alternatives to reduce CSS size
 *   (see {@link cssVarReplacements}).
 */
export function getCssVarName(styleSetting: StyleSettingPath) {
	let varName = styleSetting.replace(/\./g, '-')
	const capitalize = (word: string) => word[0].toUpperCase() + word.slice(1)
	cssVarReplacements.forEach((replacement, term) => {
		const termRegExp = new RegExp(
			[
				// The lowercase term,
				// preceded by a non-lowercase character or the beginning of the string,
				// and followed by a non-lowercase character or the end of the string
				`(?<=[^a-z]|^)${term}(?=[^a-z]|$)`,
				// The capitalized term,
				// preceded by a lowercase character or the beginning of the string,
				// and followed by a non-lowercase character or the end of the string
				`(?<=[a-z]|^)${capitalize(term)}(?=[^a-z]|$)`,
			].join('|'),
			'g'
		)
		varName = varName.replace(termRegExp, (match) => (match === term ? replacement : capitalize(replacement)))
	})
	return `--ec-${varName}`
}

export const codeLineClass = 'ec-line'
