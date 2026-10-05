"""Compare independent point reads and shared regional reads on synthetic arrays."""
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import numpy as np
import xarray as xr
from bunaken_engine.registry import load_sources
from bunaken_engine.sources import collect_copernicus
from bunaken_engine.copernicus_batch import regional_collect, point_key
from test_providers import GEOMETRY

class RegionalTest(unittest.TestCase):
    def test_shared_cells_load_once_and_preserve_per_site_values_and_distance(self):
        class SDK:
            descriptions=0
            reads=0
            def describe(self,**params):
                self.descriptions+=1
                return SimpleNamespace(products=[SimpleNamespace(datasets=[SimpleNamespace(dataset_id=params['dataset_id'],versions=[SimpleNamespace(label='202406',get_part=lambda _:SimpleNamespace(name='default',arco_updated_date='2026-01-01T00:00:00Z'))])])])
            def open_dataset(self,**params):
                self.reads+=1
                if params.get('dataset_part')=='bathy':return xr.Dataset(dict(deptho=(('latitude','longitude'),[[100.]]),mask=(('latitude','longitude'),[[1]])),coords=dict(latitude=[1.],longitude=[124.]))
                ds=xr.Dataset({name:(('time','depth','latitude','longitude'),np.array([[[[1.]],[[3.]]],[[[3.]],[[5.]]]])) for name in ['uo','vo']},coords=dict(time=np.array(['2026-01-01T00:00','2026-01-01T06:00'],dtype='datetime64[ns]'),depth=[10.,20.],latitude=[1.],longitude=[124.]))
                for name in ['uo','vo']:ds[name].attrs['units']='m s-1'
                return ds
        source=load_sources()['copernicus-currents'];points=[GEOMETRY,{**GEOMETRY,'site_id':'other','lat':1.01}]
        before=SDK()
        baseline=[collect_copernicus(source,g,'2026-01-01T00:00Z','2026-01-01T06:00Z',15,sdk=before,username='synthetic',password='synthetic',extraction_depths=[15]) for g in points]
        after=SDK()
        with patch.dict('os.environ',{'COPERNICUSMARINE_SERVICE_USERNAME':'synthetic','COPERNICUSMARINE_SERVICE_PASSWORD':'synthetic'}),patch('bunaken_engine.sources.utc_now',return_value=baseline[0][0]['retrieved_at']):
            result=regional_collect(source,points,'2026-01-01T00:00Z','2026-01-01T06:00Z',[15],sdk=after)
        self.assertEqual((before.descriptions,before.reads),(2,4))
        self.assertEqual((after.descriptions,after.reads),(1,2))
        for i,g in enumerate(points):self.assertEqual(result[point_key(g)]['samples'],baseline[i])
        self.assertGreater(result[point_key(points[1])]['samples'][0]['grid_distance_km'],0)
