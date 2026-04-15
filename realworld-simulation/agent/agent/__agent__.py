"""
Optional Google ADK app surface — deterministic agents (no LLM).

Run from agent/ with PYTHONPATH=. :
  adk web  # if your ADK CLI discovers __agent__.py
"""

from scenario_a.old_web_agent import OldWebScenarioAgent
from scenario_b.eep_agent import EEPScenarioAgent

# Expose for tooling that imports root agents
agents = [OldWebScenarioAgent(), EEPScenarioAgent()]
