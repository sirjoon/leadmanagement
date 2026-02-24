{{/*
Expand the name of the chart.
*/}}
{{- define "dentacrm.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "dentacrm.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "dentacrm.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "dentacrm.labels" -}}
helm.sh/chart: {{ include "dentacrm.chart" . }}
{{ include "dentacrm.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "dentacrm.selectorLabels" -}}
app.kubernetes.io/name: {{ include "dentacrm.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
API labels
*/}}
{{- define "dentacrm.api.labels" -}}
{{ include "dentacrm.labels" . }}
app.kubernetes.io/component: api
{{- end }}

{{/*
API selector labels
*/}}
{{- define "dentacrm.api.selectorLabels" -}}
{{ include "dentacrm.selectorLabels" . }}
app.kubernetes.io/component: api
{{- end }}

{{/*
Frontend labels
*/}}
{{- define "dentacrm.frontend.labels" -}}
{{ include "dentacrm.labels" . }}
app.kubernetes.io/component: frontend
{{- end }}

{{/*
Frontend selector labels
*/}}
{{- define "dentacrm.frontend.selectorLabels" -}}
{{ include "dentacrm.selectorLabels" . }}
app.kubernetes.io/component: frontend
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "dentacrm.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "dentacrm.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Generate image name with registry
*/}}
{{- define "dentacrm.image" -}}
{{- if .Values.image.registry }}
{{- printf "%s/%s:%s" .Values.image.registry .repository .tag }}
{{- else }}
{{- printf "%s:%s" .repository .tag }}
{{- end }}
{{- end }}
