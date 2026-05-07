export async function liteServerFetch(url: string, options?: RequestInit): Promise<Response> {
  const baseUrl = process.env.LITE_API_URL || 'http://localhost:3001'
  const fullUrl = `${baseUrl}${url}`
  
  const defaultHeaders = {
    'Content-Type': 'application/json',
  }
  
  const config = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options?.headers,
    },
  }
  
  try {
    const response = await fetch(fullUrl, config)
    return response
  } catch (error) {
    console.error('Lite API fetch error:', error)
    throw error
  }
}
