import * as THREE from 'three'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader'
import { DRACOExporter } from 'three/examples/jsm/exporters/DRACOExporter'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader'

const LOAD_TYPE = {
    UNKNOWN: 0,
    DRC: 1,
    STL: 2,
    PLY: 3,
    MQ: 4,
    values: {
        0: { name: 'unknown', value: 0 },
        1: { name: 'drc', value: 1 },
        2: { name: 'stl', value: 2 },
        3: { name: 'ply', value: 3 },
        4: { name: 'mq', value: 4 },
    },
}

/**
 * @description: 将3D格式模型统一转换为drc格式模型
 * @param {object} file input中change的file文件信息
 * @param {string} uuid 病人的唯一标识id值
 * @param {string} mark 前端生成的10位数随机字符
 * @return { path: 后缀名为drc格式的文件名称, data: 转换为blob二进制的数据 }
 */
export async function filePathTransform(file, uuid, mark) {
    let path = ''
    let data = null
    const { name } = file
    const type = name.slice(name.lastIndexOf('.') + 1)
    if (type !== 'drc') {
        path = `${mark}/${uuid}/${mark}.drc`
        data = await transformDrc(file)
    } else {
        path = `${mark}/${uuid}/${mark}${type}`
        data = file
    }
    return { path, data }
}

// 将file文件转为二进制
export async function transformDrc(file) {
    const exporter = new DRACOExporter()
    const mesh = await loadModel(file)
    const result = exporter.parse(mesh, {
        exportColor: false,
        exportUvs: false,
    })
    const blob = new Blob([result], { type: 'application/octet-stream' })
    return blob
}

// 将文件转换为二进制后放入URL.createObjectURL直接生成mesh文件
export function loadModel(file) {
    let name = file
    let path = file
    if (file instanceof Blob) {
        name = file.name
        path = URL.createObjectURL(file)
    }
    const loaderType = getFileType(name)
    const loader = setLoaderType(loaderType)
    return new Promise((resolve) => {
        loader.load(path, (geometry) => {
            const material = new THREE.MeshStandardMaterial({
                side: THREE.DoubleSide,
                color: 0xffffff,
            })
            if (!geometry.isBufferGeometry) {
                const loaderGeometry = new THREE.BufferGeometry()
                loaderGeometry.fromGeometry(geometry)
                geometry = loaderGeometry
            }
            geometry.computeVertexNormals()

            const mesh = new THREE.Mesh(geometry, material)
            mesh.url = file
            resolve(mesh)
        })
    })
}

// 通过文件后缀名来判断文件类型
export function getFileType(name) {
    for (const typeIndex in LOAD_TYPE.values) {
        const typeName = LOAD_TYPE.values[typeIndex].name
        const str1 = `.${typeName}`
        const str2 = `.${typeName}?`
        if (name.endsWith(str1) || name.indexOf(str2) > 0) {
            return LOAD_TYPE.values[typeIndex].value
        }
    }
    return LOAD_TYPE.UNKNOWN
}

// 根据file类型自动选择加载方法
export function setLoaderType(loadType) {
    let loader = null
    switch (loadType) {
        case LOAD_TYPE.DRC:
        case LOAD_TYPE.MQ:
            loader = new DRACOLoader()
            loader.setDecoderPath('/libs/draco/')
            loader.setDecoderConfig({ type: 'js' })
            break

        case LOAD_TYPE.STL:
            loader = new STLLoader()
            break
        case LOAD_TYPE.PLY:
            loader = new PLYLoader()
            break
        default:
            loader = null
    }
    return loader
}

export function bufferGeometryMergeVertices(geometry) {
    const verticesMap = {}
    let precisionPoints = 8
    const precision = Math.pow(10, precisionPoints)

    let vertices = geometry.attributes.position.array
    if (geometry.index) {
        const idx = geometry.index.array
        const oldVertices = new Float32Array(idx.length * 3)
        for (let i = 0, il = idx.length; i < il; i++) {
            oldVertices[i * 3] = vertices[idx[i] * 3]
            oldVertices[i * 3 + 1] = vertices[idx[i] * 3 + 1]
            oldVertices[i * 3 + 2] = vertices[idx[i] * 3 + 2]
        }
        geometry.index = null
        vertices = oldVertices
    }
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(Math.floor(vertices.length / 3)), 1))
    const indices = geometry.index.array

    let vCount = 0,
        faceIndicesToRemove = []
    for (let i = 0, il = vertices.length; i < il; i += 3) {
        //遍历顶点数组
        const iIndex = Math.floor(i / 3)
        const key =
            Math.round(vertices[i] * precision) +
            '_' +
            Math.round(vertices[i + 1] * precision) +
            '_' +
            Math.round(vertices[i + 2] * precision) //设置HashMap的key属性值
        if (verticesMap[key] === undefined) {
            const vIndex = vCount * 3
            verticesMap[key] = indices[iIndex] = vCount++
            vertices[vIndex] = vertices[i]
            vertices[vIndex + 1] = vertices[i + 1]
            vertices[vIndex + 2] = vertices[i + 2]
        } else {
            indices[iIndex] = verticesMap[key]
        }
        const prevIndex = iIndex - 2
        if (prevIndex >= 0 && prevIndex % 3 == 0) {
            // 如果在Face3中发现任何重复的顶点, 我们将删除顶点
            for (let n = 0; n < 3; n++) {
                //对面的3个点进行遍历.
                if (indices[prevIndex + n] == indices[prevIndex + ((n + 1) % 3)]) {
                    faceIndicesToRemove.push(prevIndex) //将要删除的面放到数组faceIndicesToRemove中
                    break
                }
            }
        }
    }
    const newVertices = new Float32Array(vCount * 3)
    for (let i = 0, il = newVertices.length; i < il; i++) {
        newVertices[i] = vertices[i]
    }
    if (geometry.setAttribute) geometry.setAttribute('position', new THREE.BufferAttribute(newVertices, 3))
    else geometry.addAttribute('position', new THREE.BufferAttribute(newVertices, 3))

    if (faceIndicesToRemove.length > 0) {
        const newIndices = new Uint32Array(indices.length - faceIndicesToRemove.length * 3)
        let nIndex = 0,
            iRemove = 0
        for (let i = 0, il = indices.length; i < il; i += 3) {
            if (i == faceIndicesToRemove[iRemove]) {
                iRemove++
            } else {
                newIndices[nIndex] = indices[i]
                newIndices[nIndex + 1] = indices[i + 1]
                newIndices[nIndex + 2] = indices[i + 2]
                nIndex += 3
            }
        }
        geometry.setIndex(new THREE.BufferAttribute(newIndices, 1))
    }
    geometry.computeVertexNormals()
    return vCount //返回新的几何体对象
}

