export type ExperimentStatus = 'draft' | 'published' | 'inactive' | 'active';

export interface Experiment {
  id: string;
  name: string;
  system_type: string;
  image_name: string;
  status: ExperimentStatus;
  sort_order?: number;
  task_config: TaskConfig;
}

export interface TaskConfig {
  system?: string;
  image_name?: string;
  objective?: string;
  steps: Step[];
  container_spec?: ContainerSpec;
  schema_version?: number;
  sort_order?: number;
}

export interface Step {
  id: number;
  title: string;
  goal?: string;
  instructions?: string;
  try_commands?: string[];
  success_criteria?: string;
  coach_focus?: string;
  verification?: Verification;
}

export interface Verification {
  mode?: 'all' | 'any' | string;
  checks?: Check[];
}

export interface Check {
  type: string;
  command?: string;
  commands?: string[];
  sequence?: string[];
  mode?: string;
  path?: string;
  path_type?: string;
  text?: string;
  contains?: string[];
  exit_code?: number;
  require_success?: boolean;
  content?: string;
  expected?: string | number | boolean;
}

export interface ContainerSpec {
  base_image: string;
  packages: string[];
  pip_packages: string[];
  npm_packages: string[];
  student_dirs: string[];
  student_files: string[];
  sources: {
    openeuler_mirror: string;
    pip_index_url: string;
    npm_registry: string;
  };
}

export interface LabSession {
  id: string;
  student_id: string;
  experiment_id: string;
  experiment_name?: string;
  container_id?: string;
  container_name?: string;
  terminal_url?: string;
  start_time?: string;
  end_time?: string;
  status: string;
  runtime_mode: 'docker' | 'mock';
}

export interface StudentRecord {
  student_id: string;
  name?: string;
  status: 'active' | string;
  created_at?: string;
}

export interface StepProgress {
  step_id: number;
  status: 'locked' | 'pending' | 'completed' | 'confirmed';
  detected_at?: string;
  confirmed_at?: string;
}

export interface StepListItem {
  id: number;
  title: string;
}

export interface StepProgressResponse {
  progress: StepProgress[];
  steps: StepListItem[];
}

export interface AICoachRecord {
  id: string;
  command: string;
  ai_response: string;
  created_at: string;
}

export interface TerminalLog {
  id: string;
  clean_content: string;
  created_at: string;
}

export interface BuildState {
  build_id: string;
  id?: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | '';
  logs: string;
  error: string;
  dockerfile: string;
  experiment_id: string;
}

export interface ImportPayload {
  draft?: Partial<Experiment> & { steps?: Step[]; container_spec?: ContainerSpec };
  steps?: Step[];
  warnings: string[];
  raw_output: string;
  source?: string;
}

export interface StudentImportPayload {
  created: number;
  updated: number;
  skipped: number;
  warnings: string[];
  imported: StudentRecord[];
  students: StudentRecord[];
}
