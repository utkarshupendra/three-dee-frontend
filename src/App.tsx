import { useState, Suspense, Component, ReactNode, useEffect, useCallback } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || ''
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment, useGLTF, Center } from '@react-three/drei'
import { useDropzone } from 'react-dropzone'
import { Upload, Loader2, Download, Box, Image as ImageIcon, X, Trash2, Edit2, Save, Grid, Plus } from 'lucide-react'

type ViewType = 'front' | 'back' | 'left' | 'right'

interface ViewImages {
  front: File | null
  back: File | null
  left: File | null
  right: File | null
}

interface SavedModel {
  id: number
  task_id: string
  name: string
  description: string | null
  model_url: string
  thumbnail_url: string | null
  view_config: Record<string, string> | null
  created_at: string
}

interface ConversionResult {
  status: string
  task_id: string
  model_id?: number
  model_url: string
  thumbnail_url?: string
}

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url)
  return (
    <Center>
      <primitive object={scene} scale={2} />
    </Center>
  )
}

class ErrorBoundary extends Component<{children: ReactNode, fallback: ReactNode}, {hasError: boolean}> {
  constructor(props: {children: ReactNode, fallback: ReactNode}) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback
    }
    return this.props.children
  }
}

function ModelViewer({ modelUrl }: { modelUrl: string }) {
  return (
    <ErrorBoundary fallback={
      <div className="h-full flex items-center justify-center text-red-400">
        <p>Failed to load 3D model. Try downloading instead.</p>
      </div>
    }>
      <Canvas camera={{ position: [0, 0, 4], fov: 45 }} shadows>
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 5, 5]} intensity={1} castShadow />
        <directionalLight position={[-5, 5, -5]} intensity={0.5} />
        <spotLight position={[0, 10, 0]} angle={0.3} penumbra={1} intensity={0.8} />
        <Suspense fallback={
          <mesh>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="gray" />
          </mesh>
        }>
          <Model url={modelUrl} />
          <Environment preset="city" background={false} />
        </Suspense>
        <OrbitControls 
          autoRotate 
          autoRotateSpeed={1} 
          enablePan={true}
          enableZoom={true}
          minDistance={1}
          maxDistance={20}
        />
      </Canvas>
    </ErrorBoundary>
  )
}

function ViewUploadField({ 
  view, 
  file, 
  onFileChange, 
  required = false 
}: { 
  view: ViewType
  file: File | null
  onFileChange: (view: ViewType, file: File | null) => void
  required?: boolean
}) {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      onFileChange(view, acceptedFiles[0])
    }
  }, [view, onFileChange])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] },
    maxFiles: 1
  })

  const preview = file ? URL.createObjectURL(file) : null

  return (
    <div className="flex flex-col">
      <label className="text-sm font-medium text-gray-300 mb-1 capitalize">
        {view} {required && <span className="text-red-400">*</span>}
      </label>
      <div
        {...getRootProps()}
        className={`
          relative h-24 border-2 border-dashed rounded-lg cursor-pointer transition-all overflow-hidden
          ${isDragActive ? 'border-purple-400 bg-purple-400/10' : 'border-gray-600 hover:border-purple-400'}
          ${file ? 'border-green-500/50' : ''}
        `}
      >
        <input {...getInputProps()} />
        {preview ? (
          <>
            <img src={preview} alt={view} className="w-full h-full object-cover" />
            <button
              onClick={(e) => { e.stopPropagation(); onFileChange(view, null); }}
              className="absolute top-1 right-1 bg-red-500 rounded-full p-1 hover:bg-red-600"
            >
              <X className="w-3 h-3 text-white" />
            </button>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-gray-500">
            <Upload className="w-5 h-5 mb-1" />
            <span className="text-xs">{view}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function App() {
  const [activeTab, setActiveTab] = useState<'create' | 'gallery'>('create')
  const [viewImages, setViewImages] = useState<ViewImages>({ front: null, back: null, left: null, right: null })
  const [modelName, setModelName] = useState('')
  const [isConverting, setIsConverting] = useState(false)
  const [conversionResult, setConversionResult] = useState<ConversionResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState('')
  const [savedModels, setSavedModels] = useState<SavedModel[]>([])
  const [selectedModel, setSelectedModel] = useState<SavedModel | null>(null)
  const [editingModel, setEditingModel] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')

  const fetchModels = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/models`)
      const data = await response.json()
      setSavedModels(data.models || [])
    } catch (err) {
      console.error('Failed to fetch models:', err)
    }
  }, [])

  useEffect(() => {
    fetchModels()
  }, [fetchModels])

  const handleViewFileChange = (view: ViewType, file: File | null) => {
    setViewImages(prev => ({ ...prev, [view]: file }))
  }

  const clearAllViews = () => {
    setViewImages({ front: null, back: null, left: null, right: null })
    setModelName('')
    setConversionResult(null)
    setError(null)
  }

  const handleConvert = async () => {
    if (!viewImages.front) {
      setError('Front view image is required')
      return
    }

    setIsConverting(true)
    setError(null)
    setProgress('Uploading images...')

    try {
      const formData = new FormData()
      formData.append('front', viewImages.front)
      if (viewImages.back) formData.append('back', viewImages.back)
      if (viewImages.left) formData.append('left', viewImages.left)
      if (viewImages.right) formData.append('right', viewImages.right)
      if (modelName) formData.append('name', modelName)

      const viewCount = [viewImages.front, viewImages.back, viewImages.left, viewImages.right].filter(Boolean).length
      setProgress(`Processing ${viewCount} view(s) with Tripo3D (30-90 seconds)...`)

      const response = await fetch(`${API_BASE}/api/convert-multiview`, {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Conversion failed')
      }

      const result = await response.json()
      setConversionResult(result)
      setProgress('')
      fetchModels()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setProgress('')
    } finally {
      setIsConverting(false)
    }
  }

  const handleDeleteModel = async (modelId: number) => {
    if (!confirm('Are you sure you want to delete this model?')) return
    
    try {
      await fetch(`${API_BASE}/api/models/${modelId}`, { method: 'DELETE' })
      fetchModels()
      if (selectedModel?.id === modelId) setSelectedModel(null)
    } catch (err) {
      console.error('Failed to delete model:', err)
    }
  }

  const handleUpdateModel = async (modelId: number) => {
    try {
      await fetch(`${API_BASE}/api/models/${modelId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, description: editDescription })
      })
      setEditingModel(null)
      fetchModels()
    } catch (err) {
      console.error('Failed to update model:', err)
    }
  }

  const getProxyUrl = (url: string) => {
    if (!url) return null
    return url.startsWith('http') ? `${API_BASE}/api/proxy-glb?url=${encodeURIComponent(url)}` : url
  }

  const displayModelUrl = conversionResult?.model_url 
    ? getProxyUrl(conversionResult.model_url)
    : selectedModel?.model_url 
      ? getProxyUrl(selectedModel.model_url) 
      : null

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2 flex items-center justify-center gap-3">
            <Box className="w-10 h-10 text-purple-400" />
            2D to 3D Converter
          </h1>
          <p className="text-gray-400">Upload images by view position to create accurate 3D models</p>
        </div>

        {/* Tab Navigation */}
        <div className="flex justify-center mb-6">
          <div className="bg-white/5 rounded-xl p-1 flex gap-1">
            <button
              onClick={() => setActiveTab('create')}
              className={`px-6 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
                activeTab === 'create' ? 'bg-purple-500 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Plus className="w-4 h-4" /> Create New
            </button>
            <button
              onClick={() => setActiveTab('gallery')}
              className={`px-6 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
                activeTab === 'gallery' ? 'bg-purple-500 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Grid className="w-4 h-4" /> Gallery ({savedModels.length})
            </button>
          </div>
        </div>

        {activeTab === 'create' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Panel - View Upload */}
            <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/10">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-purple-400" />
                  Upload Views
                </h2>
                <button onClick={clearAllViews} className="text-gray-400 hover:text-white text-sm flex items-center gap-1">
                  <X className="w-4 h-4" /> Clear all
                </button>
              </div>

              <div className="mb-4">
                <label className="text-sm font-medium text-gray-300 mb-1 block">Model Name (optional)</label>
                <input
                  type="text"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="My 3D Model"
                  className="w-full px-3 py-2 bg-black/30 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:border-purple-400 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <ViewUploadField view="front" file={viewImages.front} onFileChange={handleViewFileChange} required />
                <ViewUploadField view="back" file={viewImages.back} onFileChange={handleViewFileChange} />
                <ViewUploadField view="left" file={viewImages.left} onFileChange={handleViewFileChange} />
                <ViewUploadField view="right" file={viewImages.right} onFileChange={handleViewFileChange} />
              </div>

              <p className="mt-3 text-xs text-gray-500">
                Front view is required. More views = better 3D model accuracy.
              </p>

              <button
                onClick={handleConvert}
                disabled={!viewImages.front || isConverting}
                className={`w-full mt-4 py-3 px-6 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                  !viewImages.front || isConverting
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600'
                }`}
              >
                {isConverting ? <><Loader2 className="w-5 h-5 animate-spin" /> Converting...</> : <><Box className="w-5 h-5" /> Convert to 3D</>}
              </button>

              {progress && <p className="mt-3 text-center text-purple-400 text-sm animate-pulse">{progress}</p>}
              {error && <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg"><p className="text-red-400 text-sm">{error}</p></div>}
            </div>

            {/* Right Panel - 3D Preview */}
            <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/10">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                  <Box className="w-5 h-5 text-purple-400" /> 3D Preview
                </h2>
                {displayModelUrl && (
                  <button
                    onClick={() => window.open(conversionResult?.model_url || selectedModel?.model_url, '_blank')}
                    className="flex items-center gap-2 px-4 py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30"
                  >
                    <Download className="w-4 h-4" /> Download GLB
                  </button>
                )}
              </div>

              <div className="h-80 bg-black/30 rounded-xl overflow-hidden">
                {displayModelUrl ? (
                  <ModelViewer modelUrl={displayModelUrl} />
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-500">
                    <div className="text-center">
                      <Box className="w-16 h-16 mx-auto mb-4 opacity-30" />
                      <p>3D model will appear here</p>
                    </div>
                  </div>
                )}
              </div>

              {conversionResult && (
                <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <p className="text-green-400 text-sm">Model saved! Check the Gallery tab.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Gallery Tab */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Model List */}
            <div className="lg:col-span-2 bg-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/10">
              <h2 className="text-xl font-semibold text-white mb-4">Saved Models</h2>
              {savedModels.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Box className="w-16 h-16 mx-auto mb-4 opacity-30" />
                  <p>No models yet. Create one in the Create tab!</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {savedModels.map((model) => (
                    <div
                      key={model.id}
                      onClick={() => { setSelectedModel(model); setConversionResult(null); }}
                      className={`relative p-3 rounded-xl cursor-pointer transition-all ${
                        selectedModel?.id === model.id ? 'bg-purple-500/20 border-purple-500' : 'bg-black/20 hover:bg-black/30'
                      } border border-white/10`}
                    >
                      <div className="h-24 bg-gray-800 rounded-lg mb-2 flex items-center justify-center overflow-hidden">
                        {model.thumbnail_url ? (
                          <img src={model.thumbnail_url} alt={model.name} className="w-full h-full object-cover" />
                        ) : (
                          <Box className="w-8 h-8 text-gray-600" />
                        )}
                      </div>
                      
                      {editingModel === model.id ? (
                        <div className="space-y-2">
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full px-2 py-1 bg-black/50 border border-gray-600 rounded text-white text-xs"
                            placeholder="Name"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <textarea
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            className="w-full px-2 py-1 bg-black/50 border border-gray-600 rounded text-white text-xs resize-none"
                            placeholder="Description"
                            rows={2}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="flex gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleUpdateModel(model.id); }}
                              className="flex-1 py-1 bg-green-500/20 text-green-400 rounded text-xs hover:bg-green-500/30"
                            >
                              <Save className="w-3 h-3 inline mr-1" /> Save
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingModel(null); }}
                              className="flex-1 py-1 bg-gray-500/20 text-gray-400 rounded text-xs hover:bg-gray-500/30"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-white text-sm font-medium truncate">{model.name}</p>
                          <p className="text-gray-500 text-xs truncate">{model.description || 'No description'}</p>
                          <p className="text-gray-600 text-xs mt-1">{new Date(model.created_at).toLocaleDateString()}</p>
                          
                          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                setEditingModel(model.id);
                                setEditName(model.name);
                                setEditDescription(model.description || '');
                              }}
                              className="p-1 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteModel(model.id); }}
                              className="p-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Preview Panel */}
            <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/10">
              <h2 className="text-xl font-semibold text-white mb-4">Preview</h2>
              <div className="h-64 bg-black/30 rounded-xl overflow-hidden">
                {selectedModel && displayModelUrl ? (
                  <ModelViewer modelUrl={displayModelUrl} />
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-500">
                    <p className="text-sm">Select a model to preview</p>
                  </div>
                )}
              </div>
              {selectedModel && (
                <div className="mt-4 space-y-2">
                  <p className="text-white font-medium">{selectedModel.name}</p>
                  <p className="text-gray-400 text-sm">{selectedModel.description || 'No description'}</p>
                  <button
                    onClick={() => window.open(selectedModel.model_url, '_blank')}
                    className="w-full py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" /> Download GLB
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
