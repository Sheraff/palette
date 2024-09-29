import shortNames from './short-names.ts'

const basicColors = [
	'red',
	'green',
	'blue',
	'yellow',
	'orange',
	'purple',
	'pink',
	'saddlebrown',
	'black',
	'white',
	'gray',
	'cyan',
	'magenta',
	'lime',
	'beige',
	'salmon',
]

export default Object.fromEntries(basicColors.map((color) => [color, shortNames[color]]))