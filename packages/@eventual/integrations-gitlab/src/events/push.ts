//Generated with https://app.quicktype.io
export interface PushEvent {
  object_kind: "push";
  event_name: string;
  before: string;
  after: string;
  ref: string;
  checkout_sha: string;
  user_id: number;
  user_name: string;
  user_username: string;
  user_email: string;
  user_avatar: string;
  project_id: number;
  project: Project;
  repository: Repository;
  commits: Commit[];
  total_commits_count: number;
}

export interface Commit {
  id: string;
  message: string;
  title: string;
  timestamp: Date;
  url: string;
  author: Author;
  added: string[];
  modified: string[];
  removed: any[];
}

export interface Author {
  name: string;
  email: string;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  web_url: string;
  avatar_url: null;
  git_ssh_url: string;
  git_http_url: string;
  namespace: string;
  visibility_level: number;
  path_with_namespace: string;
  default_branch: string;
  homepage: string;
  url: string;
  ssh_url: string;
  http_url: string;
}

export interface Repository {
  name: string;
  url: string;
  description: string;
  homepage: string;
  git_http_url: string;
  git_ssh_url: string;
  visibility_level: number;
}
