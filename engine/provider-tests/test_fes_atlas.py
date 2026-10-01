"""Synthetic atlas fixture only; never reads credentials or real provider files."""
import io
import json
import lzma
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import numpy as np
import xarray as xr

from bunaken_engine.fes_atlas import install, WAVES


class Response(io.BytesIO):
    def __init__(self,body,headers,status=200):
        super().__init__(body)
        self.headers,self.status = headers,status


class FesAtlasProviderTest(unittest.TestCase):
    def test_download_resume_crc_units_and_regional_config(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            original = root/'fixture.nc'
            xr.Dataset({'amplitude':(('lat','lon'),np.ones((15,15)),{'units':'cm'}),
                        'phase':(('lat','lon'),np.zeros((15,15)),{'units':'degrees'})},
                       coords={'lat':np.linspace(1.3,1.9,15),'lon':np.linspace(124.4,125,15)}).to_netcdf(original)
            packed = lzma.compress(original.read_bytes())
            output = root/'atlas'
            (output/'original').mkdir(parents=True)
            partial = output/'original/2n2_fes2022.nc.xz.part'
            partial.write_bytes(packed[:20])
            ranges = []
            def opener(request,timeout):
                headers = {'Content-Length':str(len(packed)),'Last-Modified':'Thu, 01 Jan 2026 00:00:00 GMT'}
                if request.get_method() == 'HEAD':
                    return Response(b'',headers)
                offset = int(request.get_header('Range','bytes=0-').split('=')[1].split('-')[0])
                if offset:
                    ranges.append(offset)
                    headers['Content-Range'] = f'bytes {offset}-{len(packed)-1}/{len(packed)}'
                return Response(packed[offset:],headers,206 if offset else 200)
            with patch.dict(os.environ,{'AVISO_USERNAME':'synthetic','AVISO_PASSWORD':'synthetic'}), patch('bunaken_engine.fes_atlas.urlopen',side_effect=opener),patch('builtins.print'):
                result = install(output,[{'lat':1.6,'lon':124.7}])
            self.assertEqual(ranges,[20])
            self.assertEqual(len(result['files']),len(WAVES))
            self.assertEqual(result['dataset'],'FES2022b')
            self.assertFalse(partial.exists())
            self.assertEqual(json.loads((output/'fes2022.yaml').read_text())['tide']['cartesian']['dynamic'],['A5'])

    def test_invalid_coordinates_fail_before_network(self):
        with TemporaryDirectory() as tmp, patch('bunaken_engine.fes_atlas.urlopen') as opener:
            for sites in ([],[{'lat':float('nan'),'lon':124}],[{'lat':1,'lon':181}]):
                with self.assertRaisesRegex(ValueError,'atlas_coordinates_invalid'):
                    install(Path(tmp),sites)
            opener.assert_not_called()
