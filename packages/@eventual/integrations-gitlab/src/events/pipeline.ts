//Generated with https://app.quicktype.io
export interface PipelineEvent {
  object_kind: "pipeline";
  object_attributes: ObjectAttributes;
  merge_request: MergeRequest;
  user: User;
  project: PipelineEventProject;
  commit: Commit;
  source_pipeline: SourcePipeline;
  builds: Build[];
}

export interface Build {
  id: number;
  stage: string;
  name: string;
  status: string;
  created_at: string;
  started_at: null | string;
  finished_at: null | string;
  duration: number | null;
  queued_duration: number | null;
  failure_reason: null | string;
  when: string;
  manual: boolean;
  allow_failure: boolean;
  user: User;
  runner: Runner | null;
  artifacts_file: ArtifactsFile;
  environment: Environment | null;
}

export interface ArtifactsFile {
  filename: null;
  size: null;
}

export interface Environment {
  name: string;
  action: string;
  deployment_tier: string;
}

export interface Runner {
  id: number;
  description: string;
  active: boolean;
  runner_type: string;
  is_shared: boolean;
  tags: string[];
}

export interface User {
  id: number;
  name: string;
  username: string;
  avatar_url: string;
  email: string;
}

export interface Commit {
  id: string;
  message: string;
  timestamp: Date;
  url: string;
  author: Author;
}

export interface Author {
  name: string;
  email: string;
}

export interface MergeRequest {
  id: number;
  iid: number;
  title: string;
  source_branch: string;
  source_project_id: number;
  target_branch: string;
  target_project_id: number;
  state: string;
  merge_status: string;
  detailed_merge_status: string;
  url: string;
}

export interface ObjectAttributes {
  id: number;
  iid: number;
  ref: string;
  tag: boolean;
  sha: string;
  before_sha: string;
  source: string;
  status: string;
  stages: string[];
  created_at: string;
  finished_at: string;
  duration: number;
  variables: Variable[];
}

export interface Variable {
  key: string;
  value: string;
}

export interface PipelineEventProject {
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
}

export interface SourcePipeline {
  project: SourcePipelineProject;
  pipeline_id: number;
  job_id: number;
}

export interface SourcePipelineProject {
  id: number;
  web_url: string;
  path_with_namespace: string;
}
