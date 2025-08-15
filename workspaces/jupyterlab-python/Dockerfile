FROM prairielearn/workspace-jupyterlab-base:latest
ARG CACHEBUST=2025-08-15-14-12-21

USER root
COPY install.sh requirements.txt /
RUN /bin/bash /install.sh

USER jovyan
