export interface User {
  id: string
  email: string
  full_name?: string
  plan: 'free' | 'diy' | 'pro' | 'pro_plus'
}

export interface Project {
  id: string
  name: string
  user_id: string
  created_at: string
}