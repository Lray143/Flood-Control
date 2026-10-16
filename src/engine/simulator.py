"""
simulator.py  –  Main time-stepping orchestrator
-------------------------------------------------
Runs the coupled surface + underground physics at a stable timestep.

CFL stability note:
  The diffusive wave scheme is stable when:
      dt ≤ dx² / (2 * max_wave_speed * dx)
  At our grid resolution (dx=1m) and typical flow speeds,
  dt = 0.5 s is a safe upper bound. Faster speeds use sub-stepping.
"""
from src.engine.state import SimulationState
from src.engine.surface import step_surface_water
from src.engine.underground import step_underground_network

MAX_STABLE_DT = 0.5  # seconds — CFL upper limit per sub-step

class Simulator:
    """
    Coupled surface + underground simulator.
    Automatically sub-steps to maintain numerical stability.
    """
    def __init__(self, state: SimulationState, dt: float = 1.0):
        self.state = state
        self.dt = dt          # "logical" timestep per call to step()

    def step(self, max_stable_dt=0.5):
        """
        Advance the simulation by self.dt seconds.
        Sub-steps internally to stay within the CFL limit, but max_stable_dt 
        can be increased at high fast-forward speeds because we implemented absolute 
        volume caps in both surface and underground physics (unconditional stability).
        """
        remaining = self.dt
        while remaining > 1e-6:
            sub_dt = min(remaining, max_stable_dt)

            # 1. Surface: rainfall + infiltration + Manning diffusive flow + inlet drainage
            step_surface_water(self.state, sub_dt)

            # 2. Underground: Manning pipe flow + surcharge
            step_underground_network(self.state, sub_dt)

            remaining -= sub_dt

        self.state.time += self.dt
        if self.state.rainfall_rate > 0.0:
            self.state.rain_duration_sec += self.dt
