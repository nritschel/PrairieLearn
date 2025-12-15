FROM prairielearn/workspace-jupyterlab-base:latest
ARG CACHEBUST=2025-12-15-14-17-42

USER root
COPY install.sh requirements.txt /
RUN /bin/bash /install.sh

USER jovyan
