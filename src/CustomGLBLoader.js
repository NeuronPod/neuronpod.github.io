// import { BufferAttribute, BufferGeometry, FileLoader, Loader, Mesh, MeshStandardMaterial } from "../three.module"
import { BufferAttribute } from "@/core/BufferAttribute"
import { BufferGeometry } from "@/core/BufferGeometry"
import { FileLoader } from "./loaders/FileLoader"
import { Loader } from "./loaders/Loader"
import { MeshStandardMaterial } from "@/materials/MeshStandardMaterial"
import { Mesh } from "@/objects/Mesh"

// GLB constants
const GLB_HEADER_BYTES = 12
const GLB_HEADER_MAGIC = 0x46546c67 // 'glTF' in ASCII
const GLB_VERSION = 2

const GLB_CHUNK_PREFIX_BYTES = 8
const GLB_CHUNK_TYPE_JSON = 0x4e4f534a // 'JSON' in ASCII
const GLB_CHUNK_TYPE_BIN = 0x004e4942 // 'BIN' in ASCII

class CustomGLBLoader extends Loader {
	constructor(manager) {
		super(manager)
	}

	load(url, onLoad, onProgress, onError) {
		const loader = new FileLoader(this.manager)
		loader.setResponseType("arraybuffer")
		loader.setRequestHeader(this.requestHeader)
		loader.setPath(this.path)
		loader.setWithCredentials(this.withCredentials)

		// loader.load(
		// 	url,
		// 	(buffer) => {
		// 		try {
		// 			onLoad(this.parse(buffer))
		// 		} catch (e) {
		// 			if (onError) {
		// 				onError(e)
		// 			} else {
		// 				console.error(e)
		// 			}
		// 			this.manager.itemError(url)
		// 		}
		// 	},
		// 	onProgress,
		// 	onError
		// )
	}

	parse(buffer) {
		const textDecoder = new TextDecoder()
		const dataView = new DataView(buffer)
		let offset = 0

		// Parse header
		const magic = dataView.getUint32(offset, true)
		offset += 4

		if (magic !== GLB_HEADER_MAGIC) {
			throw new Error("Invalid GLB file: Incorrect magic number")
		}

		const version = dataView.getUint32(offset, true)
		offset += 4

		if (version !== GLB_VERSION) {
			throw new Error(`Unsupported GLB version: ${version}`)
		}

		const totalLength = dataView.getUint32(offset, true)
		offset += 4

		if (totalLength !== buffer.byteLength) {
			throw new Error("Invalid GLB file: Length mismatch")
		}

		// Parse JSON chunk
		const jsonChunkLength = dataView.getUint32(offset, true)
		offset += 4

		const jsonChunkType = dataView.getUint32(offset, true)
		offset += 4

		if (jsonChunkType !== GLB_CHUNK_TYPE_JSON) {
			throw new Error("Invalid GLB file: First chunk must be JSON")
		}

		const jsonData = buffer.slice(offset, offset + jsonChunkLength)
		const jsonString = textDecoder.decode(jsonData)
		const json = JSON.parse(jsonString)
		offset += jsonChunkLength

		// Parse Binary chunk if present
		let binaryChunk = null
		if (offset < totalLength) {
			const binaryChunkLength = dataView.getUint32(offset, true)
			offset += 4

			const binaryChunkType = dataView.getUint32(offset, true)
			offset += 4

			if (binaryChunkType !== GLB_CHUNK_TYPE_BIN) {
				throw new Error("Invalid GLB file: Second chunk must be BIN")
			}

			binaryChunk = buffer.slice(offset, offset + binaryChunkLength)
		}

		return this.parseGLTF(json, binaryChunk)
	}

	parseGLTF(json, binaryChunk) {
		// Parse buffers
		const buffers = []
		if (json.buffers) {
			for (const bufferDef of json.buffers) {
				if (bufferDef.uri === undefined) {
					if (!binaryChunk) {
						throw new Error("GLB file missing BIN chunk")
					}
					buffers.push(binaryChunk)
				} else {
					// External buffer - not supported in this basic implementation
					throw new Error("External buffers not supported")
				}
			}
		}

		// Parse buffer views
		const bufferViews = []
		if (json.bufferViews) {
			for (const bufferViewDef of json.bufferViews) {
				const buffer = buffers[bufferViewDef.buffer]
				const byteLength = bufferViewDef.byteLength || 0
				const byteOffset = bufferViewDef.byteOffset || 0

				// Create a new ArrayBuffer from the slice
				const arrayBuffer = new Uint8Array(buffer.slice(byteOffset, byteOffset + byteLength)).buffer
				bufferViews.push(arrayBuffer)
			}
		}

		// Parse accessors
		const accessors = []
		if (json.accessors) {
			for (const accessorDef of json.accessors) {
				const bufferView = bufferViews[accessorDef.bufferView]
				const itemSize = this.getItemSize(accessorDef.type)
				const TypedArray = this.getTypedArray(accessorDef.componentType)
				const byteOffset = accessorDef.byteOffset || 0

				// Create the typed array from the ArrayBuffer
				const array = new TypedArray(bufferView)
				accessors.push(new BufferAttribute(array, itemSize))
			}
		}

		// Create geometry
		const geometry = new BufferGeometry()

		// Set attributes
		if (json.meshes && json.meshes[0].primitives) {
			const primitive = json.meshes[0].primitives[0]

			if (primitive.indices !== undefined) {
				geometry.setIndex(accessors[primitive.indices])
			}

			if (primitive.attributes) {
				for (const [name, index] of Object.entries(primitive.attributes)) {
					geometry.setAttribute(name.toLowerCase(), accessors[index])
				}
			}
		}

		// Create material (basic implementation)
		const material = new MeshStandardMaterial()

		// Create mesh
		return new Mesh(geometry, material)
	}

	getItemSize(type) {
		switch (type) {
			case "SCALAR":
				return 1
			case "VEC2":
				return 2
			case "VEC3":
				return 3
			case "VEC4":
				return 4
			case "MAT2":
				return 4
			case "MAT3":
				return 9
			case "MAT4":
				return 16
			default:
				throw new Error(`Unsupported type: ${type}`)
		}
	}

	getTypedArray(componentType) {
		switch (componentType) {
			case 5120:
				return Int8Array
			case 5121:
				return Uint8Array
			case 5122:
				return Int16Array
			case 5123:
				return Uint16Array
			case 5125:
				return Uint32Array
			case 5126:
				return Float32Array
			default:
				throw new Error(`Unsupported component type: ${componentType}`)
		}
	}
}

export { CustomGLBLoader }
