import unittest
from bunaken_engine.replay_precision import replay_equal

class ReplayPrecisionTest(unittest.TestCase):
    def test_numeric_roundoff_only(self):
        self.assertTrue(replay_equal({'wind':3.141250194873706},{'wind':3.141250194873707}))
        self.assertFalse(replay_equal({'wind':3.14},{'wind':3.140001}))
        self.assertFalse(replay_equal({'status':'insufficient'},{'status':'available'}))
        self.assertFalse(replay_equal([True],[1]))
        self.assertFalse(replay_equal([float('nan')],[float('nan')]))
        self.assertFalse(replay_equal({'hash':'abc'},{'hash':'abd'}))
        self.assertFalse(replay_equal({'key':1},{'key':1,'extra':None}))
